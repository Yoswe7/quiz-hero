import asyncio
import base64
import binascii
from io import BytesIO
import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from itertools import combinations
from typing import Any, Optional

from app.schemas.ai import GeneratedQuiz
from app.services.llm_router import LLMRouterError, generate_structured


logger = logging.getLogger("quiz_hero.ai")

QUIZ_TYPES = ("Multiple Choice", "True or False", "Identification", "Open Ended")
MAX_GENERATION_ATTEMPTS = 2


def _run_router(coro):
    """Bridge the sync generate_quiz() into the async router from any context,
    including inside a running uvicorn event loop (blocking is intentional and
    matches the previous direct-API blocking behaviour)."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    with ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, coro).result()


def extract_and_parse_json(raw_text: str) -> Any:
    """Robustly extracts and parses JSON even if wrapped in markdown codeblocks."""
    text = raw_text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
        text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    array_match = re.search(r"\[\s*\{.*\}\s*\]", text, re.DOTALL)
    if array_match:
        try:
            return json.loads(array_match.group(0))
        except json.JSONDecodeError:
            pass

    obj_match = re.search(r"\{.*\}", text, re.DOTALL)
    if obj_match:
        try:
            return json.loads(obj_match.group(0))
        except json.JSONDecodeError:
            pass

    raise ValueError("Could not parse valid JSON from AI response")


def build_prompt(
    topic: str,
    question_count: int,
    quiz_type: str,
    source_type: str = "topic",
    content_text: Optional[str] = None,
    file_name: Optional[str] = None,
    sections: Optional[list[dict]] = None,
) -> str:
    active_sections = [s for s in (sections or []) if s.get("question_count", 0) > 0]
    is_mixed = len(active_sections) > 1 or quiz_type == "Mixed Assessment"

    total_count = sum(s.get("question_count", 0) for s in active_sections) if is_mixed and active_sections else question_count

    if source_type == "file":
        base = f"Analyze the attached source document/image ('{file_name or 'file'}') thoroughly.\n"
        base += f"Create a {total_count}-question assessment derived STRICTLY from the provided material.\n"
        if topic and topic.strip() and topic != "General Curriculum Assessment":
            base += f"Focus particularly on the topic or section: {topic.strip()}.\n"
    elif source_type == "text" and content_text:
        base = f"Analyze the following course material / lecture notes thoroughly:\n"
        base += f"--- START OF SOURCE MATERIAL ---\n{content_text.strip()}\n--- END OF SOURCE MATERIAL ---\n\n"
        base += f"Create a {total_count}-question assessment derived STRICTLY from the source material above.\n"
        if topic and topic.strip() and topic != "General Curriculum Assessment":
            base += f"Focus particularly on the topic or section: {topic.strip()}.\n"
    else:
        base = f"Create a {total_count}-question assessment about {topic}.\n"

    base += f"Return EXACTLY {total_count} objects. Never return fewer or more.\n"
    base += "Use only facts supported by the topic or supplied source. Do not invent names, terms, dates, or definitions.\n"
    base += "Each item must test one distinct fact or concept. Do not duplicate or paraphrase another item.\n"
    base += 'Each item must include a 1-indexed "question_number" between 1 and the quiz length.\n'
    base += "Respond ONLY with a JSON array of objects without additional text.\n"

    if is_mixed and active_sections:
        base += "\nThe assessment must be divided into specific sections with the following exact question distribution:\n"
        for idx, sec in enumerate(active_sections):
            roman = ["I", "II", "III", "IV", "V"][min(idx, 4)]
            stype = sec.get("quiz_type", "Multiple Choice")
            scount = sec.get("question_count", 5)
            base += f"- Part {roman} ({scount} items): {stype}\n"

        base += """\nEach object in the JSON array must have:
- "question": The question text
- "quiz_type": Exactly one of ("Multiple Choice", "True or False", "Identification", "Open Ended")
- "section_name": e.g. "Part I: Multiple Choice" or "Part II: Open Ended"
- "options": For Multiple Choice: 4 options array. For True/False: ["True", "False"]. For Identification/Open Ended: [] (empty array).
- "answer": The exact correct answer string or comprehensive model answer"""
    else:
        if quiz_type == "Multiple Choice":
            base += """Each object must have:
- "question": The question text
- "quiz_type": "Multiple Choice"
- "options": An array of 4 strings
- "answer": The exact correct option string"""
        elif quiz_type == "True or False":
            base += """Each object must have:
- "question": The question text (a statement)
- "quiz_type": "True or False"
- "options": ["True", "False"]
- "answer": Either "True" or "False" """
        elif quiz_type == "Identification":
            base += """Each object must have:
- "question": The question text (should have a specific one-word or short-phrase answer)
- "quiz_type": "Identification"
- "answer": The exact correct answer (one term or short phrase, maximum 8 words)
- "options": [] (empty array)"""
        elif quiz_type == "Open Ended":
            base += """Each object must have:
- "question": An open-ended question requiring explanation
- "quiz_type": "Open Ended"
- "answer": A comprehensive model answer
- "options": [] (empty array)"""

    return base


def _decode_file_base64(file_base64: str) -> bytes:
    encoded = file_base64
    if file_base64.startswith("data:"):
        _, separator, encoded = file_base64.partition(",")
        if not separator:
            raise ValueError("Uploaded file data URL is invalid.")
    try:
        return base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as error:
        raise ValueError("Uploaded file data is not valid base64.") from error


def _render_pdf_page(document: pdfium.PdfDocument, page_index: int) -> bytes:
    page = document[page_index]
    try:
        width, height = page.get_size()
        scale = min(1.5, 1600 / width, 2000 / height)
        bitmap = page.render(scale=scale)
        try:
            image = bitmap.to_pil()
            try:
                output = BytesIO()
                image.save(output, format="JPEG", quality=80)
                return output.getvalue()
            finally:
                image.close()
        finally:
            bitmap.close()
    finally:
        page.close()


async def _extract_pdf_text(client, pdf_bytes: bytes) -> str:
    try:
        reader = PdfReader(BytesIO(pdf_bytes), strict=False)
        page_count = len(reader.pages)
        if page_count > MAX_PDF_PAGES:
            raise ValueError(
                f"PDF has {page_count} pages; split it into files with no more than {MAX_PDF_PAGES} pages."
            )
        page_texts: list[str | None] = []
        scanned_page_indexes: list[int] = []
        for index, page in enumerate(reader.pages):
            page_text = (page.extract_text() or "").strip()
            page_texts.append(page_text or None)
            if not page_text:
                scanned_page_indexes.append(index)
    except ValueError:
        raise
    except Exception as error:
        raise ValueError("The uploaded PDF could not be read.") from error

    if scanned_page_indexes:
        try:
            rendered_pdf = pdfium.PdfDocument(pdf_bytes)
        except Exception as error:
            raise ValueError("The uploaded PDF could not be rendered for text extraction.") from error

        try:
            for offset in range(0, len(scanned_page_indexes), MAX_IMAGES_PER_REQUEST):
                page_indexes = scanned_page_indexes[offset : offset + MAX_IMAGES_PER_REQUEST]
                first_page = page_indexes[0] + 1
                last_page = page_indexes[-1] + 1
                try:
                    batch = [
                        (index, _render_pdf_page(rendered_pdf, index))
                        for index in page_indexes
                    ]
                except Exception as error:
                    raise ValueError(
                        f"PDF pages {first_page}-{last_page} could not be rendered for text extraction."
                    ) from error
                if sum(len(image_bytes) for _, image_bytes in batch) > GROQ_MAX_IMAGE_BYTES:
                    raise ValueError(
                        f"Scanned PDF pages {first_page}-{last_page} are too large to process together."
                    )

                content: list[dict[str, Any]] = [{
                    "type": "text",
                    "text": (
                        "Transcribe all readable text from these scanned PDF pages in order. "
                        "Preserve headings, equations, and lists. Return only a JSON object with a "
                        '"pages" array; each item must have "page_number" (the supplied page number) '
                        'and "text" (the transcription). Do not summarize or add information.'
                    ),
                }]
                for page_index, image_bytes in batch:
                    if len(image_bytes) > GROQ_MAX_IMAGE_BYTES:
                        raise ValueError(
                            f"Scanned PDF page {page_index + 1} is too large to process. Please use a lower-resolution PDF."
                        )
                    page_data = base64.b64encode(image_bytes).decode("ascii")
                    content.extend([
                        {
                            "type": "text",
                            "text": f"PDF page number: {page_index + 1}",
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{page_data}",
                            },
                        },
                    ])

                response = await client.chat.completions.create(
                    model=settings.GROQ_MODEL,
                    messages=[{"role": "user", "content": content}],
                    response_format={"type": "json_object"},
                    temperature=0.1,
                    max_completion_tokens=12_000,
                    reasoning_effort="none",
                )
                response_text = response.choices[0].message.content
                if not response_text:
                    raise ValueError(f"Groq returned no text for PDF pages {first_page}-{last_page}.")
                ocr_result = extract_and_parse_json(response_text)
                ocr_pages = ocr_result.get("pages") if isinstance(ocr_result, dict) else None
                if not isinstance(ocr_pages, list):
                    raise ValueError(f"Groq returned an invalid OCR result for PDF pages {first_page}-{last_page}.")

                expected_indexes = set(page_indexes)
                found_indexes: set[int] = set()
                for item in ocr_pages:
                    if not isinstance(item, dict):
                        raise ValueError("Groq returned an invalid OCR page.")
                    page_number = item.get("page_number")
                    page_text = item.get("text")
                    if (
                        not isinstance(page_number, int)
                        or page_number - 1 not in expected_indexes
                        or not isinstance(page_text, str)
                        or not page_text.strip()
                    ):
                        raise ValueError("Groq returned an invalid OCR page.")
                    page_index = page_number - 1
                    if page_index in found_indexes:
                        raise ValueError("Groq returned a duplicate OCR page.")
                    page_texts[page_index] = page_text.strip()
                    found_indexes.add(page_index)
                if found_indexes != expected_indexes:
                    raise ValueError(f"Groq did not transcribe every scanned PDF page in pages {first_page}-{last_page}.")
        finally:
            rendered_pdf.close()

    extracted_text = "\n\n".join(
        f"Page {index + 1}:\n{text}"
        for index, text in enumerate(page_texts)
        if text
    )
    if not extracted_text:
        raise ValueError("No readable text was found in the PDF.")
    if len(extracted_text) > MAX_DOCUMENT_TEXT_CHARS:
        raise ValueError(
            f"PDF text exceeds {MAX_DOCUMENT_TEXT_CHARS:,} characters. Split the document into smaller files."
        )
    return extracted_text


def _expected_items(
    question_count: int,
    quiz_type: str,
    sections: Optional[list[dict]],
) -> list[tuple[str, Optional[str]]]:
    active_sections = [s for s in (sections or []) if s.get("question_count", 0) > 0]
    is_mixed = bool(active_sections) or quiz_type == "Mixed Assessment"

    if not is_mixed:
        if quiz_type not in QUIZ_TYPES:
            raise ValueError(f"Unsupported quiz type: {quiz_type}")
        return [(quiz_type, None)] * question_count

    if not active_sections:
        raise ValueError("Mixed Assessment requires at least one configured section")

    expected: list[tuple[str, Optional[str]]] = []
    roman_numerals = ["I", "II", "III", "IV", "V"]
    for index, section in enumerate(active_sections):
        section_type = section.get("quiz_type")
        section_count = section.get("question_count", 0)
        if section_type not in QUIZ_TYPES:
            raise ValueError(f"Unsupported section quiz type: {section_type}")
        if not isinstance(section_count, int) or section_count < 1:
            raise ValueError("Section question counts must be positive integers")
        section_name = f"Part {roman_numerals[min(index, len(roman_numerals) - 1)]}: {section_type}"
        expected.extend([(section_type, section_name)] * section_count)
    return expected


def _clean_text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _trim_to_expected(
    quiz_data: list,
    expected_items: list[tuple[str, Optional[str]]],
) -> Optional[list]:
    """Drop a small number of surplus items the model added.

    Models routinely overshoot (e.g. 41-44 items for a 40-item request), and
    failing the whole generation over that burns a retry for no benefit.
    Surplus entries that match the expected sequence are dropped during
    alignment; when alignment fails, the response is de-duplicated and
    re-aligned, then the surplus items (and any items that block alignment)
    are dropped until the response matches the expected outline. Short
    responses are never padded, and a large overflow is left untouched so the
    validator reports the real mismatch.
    """
    if len(quiz_data) <= len(expected_items):
        return None

    surplus = len(quiz_data) - len(expected_items)
    # Modest acceptance band: chatty models overshoot a little, and rejecting
    # a fully valid response for "just one extra" is worse than using it.
    tolerance = max(2, min(4, len(expected_items) // 10))
    if surplus > tolerance:
        return None

    def _align(items: list) -> Optional[list]:
        kept: list = []
        cursor = 0
        for expected_type, expected_section in expected_items:
            while cursor < len(items):
                item = items[cursor]
                cursor += 1
                if not isinstance(item, dict):
                    continue
                item_type = item.get("quiz_type") or expected_type
                if item_type != expected_type:
                    continue
                if expected_section and item.get("section_name") != expected_section:
                    continue
                kept.append(item)
                break
            else:
                # Could not align the response with the expected outline.
                return None
        return kept

    kept = _align(quiz_data)
    if kept is not None:
        return kept

    # Models sometimes interleave surplus or duplicate items that break
    # strict alignment: align a de-duplicated view of the same response.
    seen: set[str] = set()
    deduped: list = []
    for item in quiz_data:
        if not isinstance(item, dict):
            continue
        key = re.sub(r"\s+", " ", _clean_text(item.get("question")).casefold()).strip()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    if len(deduped) != len(quiz_data):
        kept = _align(deduped)
        if kept is not None and len(kept) == len(expected_items):
            return kept

    # Last resort: drop the surplus items (and any items that block
    # alignment) until the response matches the expected outline.
    for drop in combinations(range(len(quiz_data)), surplus):
        drop_set = set(drop)
        reduced = [item for i, item in enumerate(quiz_data) if i not in drop_set]
        kept = _align(reduced)
        if kept is not None and len(kept) == len(expected_items):
            return kept
    return None


def validate_quiz_data(
    quiz_data: list,
    quiz_type: str,
    question_count: Optional[int] = None,
    sections: Optional[list[dict]] = None,
) -> None:
    expected_items = _expected_items(question_count or 0, quiz_type, sections)
    if not isinstance(quiz_data, list):
        raise ValueError("Response is not a JSON array")
    if len(quiz_data) > len(expected_items):
        trimmed = _trim_to_expected(quiz_data, expected_items)
        if trimmed is not None:
            logger.info(
                "ai_generator trimmed %d surplus item(s): %d -> %d",
                len(quiz_data) - len(trimmed),
                len(quiz_data),
                len(trimmed),
            )
            quiz_data[:] = trimmed
    if len(quiz_data) != len(expected_items):
        raise ValueError(f"Expected exactly {len(expected_items)} items but received {len(quiz_data)}")

    seen_questions: set[str] = set()
    for index, item in enumerate(quiz_data):
        expected_type, expected_section = expected_items[index]
        _validate_item(item, expected_type, expected_section, seen_questions, index + 1)


def _validate_item(
    item: Any,
    expected_type: str,
    expected_section: Optional[str],
    seen_questions: set[str],
    index: int,
) -> None:
    """Run all per-question validation rules and re-index question_number.

    `index` is the 1-based position of the item in the expected sequence.
    Raises on any rule violation.
    """
    if not isinstance(item, dict):
        raise ValueError(f"Question {index} is not an object")

    question = _clean_text(item.get("question"))
    answer = _clean_text(item.get("answer"))
    item_type = item.get("quiz_type") or expected_type
    options = item.get("options")

    if not question or not answer:
        raise ValueError(f"Question {index} must have non-empty question and answer text")
    if item_type != expected_type:
        raise ValueError(f"Question {index} must be type '{expected_type}'")
    if expected_section and item.get("section_name") != expected_section:
        raise ValueError(f"Question {index} has the wrong section")

    normalized_question = re.sub(r"\s+", " ", question.casefold()).strip()
    if normalized_question in seen_questions:
        raise ValueError(f"Question {index} duplicates an earlier question")
    seen_questions.add(normalized_question)

    if not isinstance(options, list):
        raise ValueError(f"Question {index} must include an options array")
    option_text = [_clean_text(option) for option in options]
    if any(not option for option in option_text):
        raise ValueError(f"Question {index} contains an empty option")

    if expected_type == "Multiple Choice":
        if len(option_text) != 4 or len({option.casefold() for option in option_text}) != 4:
            raise ValueError(f"Question {index} must have exactly 4 unique options")
        if answer not in option_text:
            raise ValueError(f"Question {index} answer must match one option exactly")
    elif expected_type == "True or False":
        if option_text != ["True", "False"] or answer not in option_text:
            raise ValueError(f"Question {index} must use True/False options and answer")
    elif expected_type == "Identification":
        if option_text or len(answer.split()) > 8 or len(answer) > 100:
            raise ValueError(f"Question {index} must have one short answer and no options")
        if re.search(rf"\b{re.escape(answer.casefold())}\b", normalized_question):
            raise ValueError(f"Question {index} reveals its answer")
    elif expected_type == "Open Ended":
        if option_text or len(answer) < 20:
            raise ValueError(f"Question {index} needs a substantive model answer")

    item["question"] = question
    item["answer"] = answer
    item["quiz_type"] = expected_type
    item["options"] = option_text
    if expected_section:
        item["section_name"] = expected_section
    item["question_number"] = index


def _validate_items_prefix(
    items: list,
    expected_items: list[tuple[str, Optional[str]]],
) -> list:
    """Validate the valid prefix of an undersized response against expected_items."""
    if not isinstance(items, list):
        raise ValueError("Response is not a JSON array")
    seen_questions: set[str] = set()
    kept: list = []
    for index, item in enumerate(items[: len(expected_items)]):
        expected_type, expected_section = expected_items[index]
        _validate_item(item, expected_type, expected_section, seen_questions, index + 1)
        kept.append(item)
    return kept


def _validate_new_items(
    new_items: list,
    existing_items: list,
    expected_items: list[tuple[str, Optional[str]]],
) -> list:
    """Validate follow-up (top-up) items against the unfilled tail of the outline.

    `existing_items` are the already-validated questions; the new items must
    fill `expected_items[len(existing_items):]` and must not duplicate them.
    """
    if not isinstance(new_items, list):
        raise ValueError("Response is not a JSON array")
    start = len(existing_items)
    tail = expected_items[start:]
    if len(new_items) > len(tail):
        new_items = new_items[: len(tail)]
    seen_questions: set[str] = {
        re.sub(r"\s+", " ", _clean_text(q.get("question")).casefold()).strip()
        for q in existing_items
    }
    out: list = []
    for offset, item in enumerate(new_items):
        expected_type, expected_section = tail[offset]
        _validate_item(item, expected_type, expected_section, seen_questions, start + offset + 1)
        out.append(item)
    return out


def _top_up_prompt(
    base_prompt: str,
    existing_items: list,
    expected_items: list[tuple[str, Optional[str]]],
    missing: int,
) -> str:
    """Build the follow-up prompt that asks the model only for the missing items."""
    parts = [base_prompt]
    if existing_items:
        stems = [_clean_text(item.get("question")) for item in existing_items]
        parts.append(
            "Previously generated questions (do not repeat or paraphrase them):\n"
            + json.dumps(stems, ensure_ascii=False)
        )
    tail = expected_items[len(existing_items):]
    slot_lines = []
    for slot_index, (expected_type, expected_section) in enumerate(tail[:missing], start=len(existing_items) + 1):
        label = expected_type
        if expected_section:
            label += f" [{expected_section}]"
        slot_lines.append(f"- slot {slot_index}: {label}")
    parts.append(
        f"The previous response ended early. Generate exactly {missing} additional "
        "questions for the missing slots:\n" + "\n".join(slot_lines)
    )
    parts.append(
        'Return only the additional items; each must include "question", "quiz_type", '
        '"options", "answer", and a 1-indexed "question_number".'
    )
    return "\n".join(parts)


async def generate_quiz(
    topic: str,
    question_count: int,
    quiz_type: str,
    source_type: str = "topic",
    content_text: Optional[str] = None,
    file_base64: Optional[str] = None,
    file_mime_type: Optional[str] = None,
    file_name: Optional[str] = None,
    sections: Optional[list[dict]] = None,
) -> list[dict]:
    expected_count = sum(
        section.get("question_count", 0) for section in (sections or [])
    ) if sections else question_count
    expected_items = _expected_items(expected_count or 0, quiz_type, sections)

    prompt = build_prompt(
        topic=topic,
        question_count=question_count,
        quiz_type=quiz_type,
        source_type=source_type,
        content_text=content_text,
        file_name=file_name,
        sections=sections,
    )

    raw_bytes = None
    if source_type == "file" and file_base64 and file_mime_type:
        raw_bytes = base64.b64decode(file_base64)

    def _generate(prompt_text: str) -> GeneratedQuiz:
        return _run_router(
            generate_structured(
                prompt_text,
                GeneratedQuiz,
                task="generation",
                file_bytes=raw_bytes,
                mime_type=(file_mime_type if source_type == "file" else None),
            )
        )

    last_error = "unknown validation error"
    attempts = 0
    while attempts < MAX_GENERATION_ATTEMPTS:
        attempts += 1
        attempt_prompt = prompt
        if attempts > 1:
            attempt_prompt += (
                f"\nThe previous response failed validation: {last_error}.\n"
                "Generate a complete replacement array. Do not return a partial repair."
            )

        try:
            # Provider failover happens inside the router (Groq -> Gemini ->
            # OpenRouter for small text). Provider 429/401/403/timeouts never
            # burn retries here; only domain/semantic validation failures do.
            quiz_data = [item.model_dump() for item in _generate(attempt_prompt).items]

            # 1) Trim surplus items the model added beyond the expected count
            #    (e.g. 41 items for a 40-item request).
            if len(quiz_data) > expected_count:
                trimmed = _trim_to_expected(quiz_data, expected_items)
                if trimmed is not None:
                    logger.info(
                        "ai_generator trimmed %d surplus item(s): %d -> %d",
                        len(quiz_data) - len(trimmed),
                        len(quiz_data),
                        len(trimmed),
                    )
                    quiz_data[:] = trimmed

            # 2) Fill the count: validate the valid prefix of undersized
            #    responses and top up the missing tail with targeted calls.
            if len(quiz_data) == expected_count:
                validate_quiz_data(
                    quiz_data,
                    quiz_type,
                    question_count=expected_count,
                    sections=sections,
                )
            elif len(quiz_data) < expected_count:
                quiz_data = _validate_items_prefix(quiz_data, expected_items)
                while len(quiz_data) < expected_count and attempts < MAX_GENERATION_ATTEMPTS:
                    attempts += 1
                    missing = expected_count - len(quiz_data)
                    top_prompt = _top_up_prompt(prompt, quiz_data, expected_items, missing)
                    try:
                        new_items = [
                            item.model_dump()
                            for item in _run_router(
                                generate_structured(
                                    top_prompt,
                                    GeneratedQuiz,
                                    task="generation",
                                    file_bytes=raw_bytes,
                                    mime_type=(file_mime_type if source_type == "file" else None),
                                )
                            ).items
                        ]
                    except (ValueError, json.JSONDecodeError) as error:
                        last_error = str(error)
                        break
                    appended = _validate_new_items(new_items, quiz_data, expected_items)
                    if not appended:
                        last_error = f"top-up call produced no valid items (expected {missing} more)"
                        break
                    quiz_data.extend(appended[:missing])
                if len(quiz_data) != expected_count:
                    raise ValueError(
                        f"Expected exactly {expected_count} items but received {len(quiz_data)}"
                    )
            else:
                raise ValueError(
                    f"Expected exactly {expected_count} items but received {len(quiz_data)}"
                )

            # question_number is internal tracking: re-indexed during
            # validation; strip it so DB rows and student responses stay as-is.
            for item in quiz_data:
                item.pop("question_number", None)
            return quiz_data
        except (ValueError, json.JSONDecodeError) as error:
            # Semantic/business-rule mismatches (wrong count, wrong section …):
            # allow one retry with the validator's feedback attached.
            last_error = str(error)
        except LLMRouterError:
            # All providers failed (quota/auth/unavailable/timeout). Fail fast.
            raise

    raise ValueError(
        f"Groq generated an invalid assessment after {MAX_GENERATION_ATTEMPTS} attempts: {last_error}"
    )
