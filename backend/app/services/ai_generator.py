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

from app.schemas.ai import CompactGeneratedQuiz, GeneratedQuiz
from app.services.llm_router import LLMRouterError, _analyze_pdf, _extract_pdf_text, generate_structured


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
    generation_mode: str = "fast",
    section_label: Optional[str] = None,
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

    compact = generation_mode != "complex"
    base += f"Return EXACTLY {total_count} objects. Never return fewer or more.\n"
    base += "Use only facts supported by the topic or supplied source. Do not invent names, terms, dates, or definitions.\n"
    base += "Each item must test one distinct fact or concept. Do not duplicate or paraphrase another item.\n"
    if compact:
        base += 'Each item must include a 1-indexed "n" (question number) between 1 and the quiz length.\n'
        base += "Respond ONLY with JSON using compact keys and explicitly omit explanation and grading_rubric fields.\n"
    else:
        base += 'Each item must include a 1-indexed "question_number" between 1 and the quiz length.\n'
        base += "Respond ONLY with a JSON array of objects without additional text.\n"
    if generation_mode == "complex":
        base += (
            "Complex Mode instructions: Prioritize multi-step reasoning, mathematical accuracy, "
            "and accurate interpretation of any equations, tables, charts, or diagrams in the source. "
            "Verify numerical answers and formulas carefully.\n"
        )

    if is_mixed and active_sections:
        base += "\nThe assessment must be divided into specific sections with the following exact question distribution:\n"
        for idx, sec in enumerate(active_sections):
            roman = ["I", "II", "III", "IV", "V"][min(idx, 4)]
            stype = sec.get("quiz_type", "Multiple Choice")
            scount = sec.get("question_count", 5)
            base += f"- Part {roman} ({scount} items): {stype}\n"

        if compact:
            base += """\nEach object must use these compact keys (omit explanation and grading_rubric):
- "q": The question text
- "t": Exactly one of ("Multiple Choice", "True or False", "Identification", "Open Ended")
- "s": Section name, e.g. "Part I: Multiple Choice" or "Part II: Open Ended"
- "o": For Multiple Choice: 4 options array. For True/False: ["True", "False"]. For Identification/Open Ended: [] (empty array).
- "a": Concise exact correct answer string (or concise model answer for Open Ended)"""
        else:
            base += """\nEach object in the JSON array must have:
- "question": The question text
- "quiz_type": Exactly one of ("Multiple Choice", "True or False", "Identification", "Open Ended")
- "section_name": e.g. "Part I: Multiple Choice" or "Part II: Open Ended"
- "options": For Multiple Choice: 4 options array. For True/False: ["True", "False"]. For Identification/Open Ended: [] (empty array).
- "answer": The exact correct answer string or comprehensive model answer"""
    else:
        if section_label:
            key_name = "s" if compact else "section_name"
            base += f'\nEvery object must include "{key_name}": "{section_label}".\n'
        if compact:
            if quiz_type == "Multiple Choice":
                base += """Each object must use these compact keys (omit explanation and grading_rubric):
- "q": The question text
- "t": "Multiple Choice"
- "o": An array of 4 strings
- "a": The exact correct option string"""
            elif quiz_type == "True or False":
                base += """Each object must use these compact keys (omit explanation and grading_rubric):
- "q": The question text (a statement)
- "t": "True or False"
- "o": ["True", "False"]
- "a": Either "True" or "False" """
            elif quiz_type == "Identification":
                base += """Each object must use these compact keys (omit explanation and grading_rubric):
- "q": The question text (should have a specific one-word or short-phrase answer)
- "t": "Identification"
- "a": The exact correct answer (one term or short phrase, maximum 8 words)
- "o": [] (empty array)"""
            elif quiz_type == "Open Ended":
                base += """Each object must use these compact keys (omit explanation and grading_rubric):
- "q": An open-ended question requiring explanation
- "t": "Open Ended"
- "a": A concise model answer (at least 20 characters)
- "o": [] (empty array)"""
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


def normalize_generated_item(raw_item: Any) -> dict:
    """Map compact (q/t/o/a/s/n) or verbose LLM item keys to canonical QuizHero keys."""
    raw = raw_item.model_dump() if hasattr(raw_item, "model_dump") else dict(raw_item)
    options_raw = raw.get("options") if "options" in raw and raw.get("options") is not None else raw.get("o")
    if isinstance(options_raw, list):
        options = [str(opt) for opt in options_raw]
    else:
        options = []

    normalized: dict[str, Any] = {
        "question": _clean_text(raw.get("question") if "question" in raw and raw.get("question") is not None else raw.get("q")),
        "quiz_type": _clean_text(raw.get("quiz_type") if "quiz_type" in raw and raw.get("quiz_type") is not None else raw.get("t")),
        "options": options,
        "answer": _clean_text(raw.get("answer") if "answer" in raw and raw.get("answer") is not None else raw.get("a")),
        "explanation": _clean_text(raw.get("explanation")),
    }
    section = raw.get("section_name") if raw.get("section_name") is not None else raw.get("s")
    if isinstance(section, str) and section.strip():
        normalized["section_name"] = section.strip()
    q_num = raw.get("question_number") if raw.get("question_number") is not None else raw.get("n")
    if q_num is not None:
        normalized["question_number"] = q_num
    rubric = _clean_text(raw.get("grading_rubric"))
    if rubric:
        normalized["grading_rubric"] = rubric
    return normalized


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
    generation_mode: str = "fast",
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
    if generation_mode != "complex":
        parts.append(
            'Return only the additional items using compact keys "q", "t", "o", "a", '
            'and 1-indexed "n" (omit explanation and grading_rubric).'
        )
    else:
        parts.append(
            'Return only the additional items; each must include "question", "quiz_type", '
            '"options", "answer", and a 1-indexed "question_number".'
        )
    return "\n".join(parts)


def _split_generation_batches(
    question_count: int,
    quiz_type: str,
    sections: Optional[list[dict]],
    effective_mode: str,
) -> list[dict]:
    """Split Mixed Assessments and large item counts into bounded per-section
    batches so concurrent LLM calls stay fast and avoid count-retry waste."""
    active_sections = [s for s in (sections or []) if s.get("question_count", 0) > 0]
    chunk_limit = 10 if effective_mode == "complex" else 15
    batches: list[dict] = []

    if active_sections or quiz_type == "Mixed Assessment":
        roman_numerals = ["I", "II", "III", "IV", "V"]
        for idx, section in enumerate(active_sections):
            stype = section.get("quiz_type", "Multiple Choice")
            scount = int(section.get("question_count", 0))
            if scount <= 0:
                continue
            section_name = f"Part {roman_numerals[min(idx, len(roman_numerals) - 1)]}: {stype}"
            if scount <= chunk_limit:
                batches.append({
                    "quiz_type": stype,
                    "question_count": scount,
                    "section_name": section_name,
                    "chunk_index": 0,
                    "chunk_total": 1,
                })
            else:
                chunks = [
                    min(chunk_limit, scount - offset)
                    for offset in range(0, scount, chunk_limit)
                ]
                for c_idx, c_count in enumerate(chunks):
                    batches.append({
                        "quiz_type": stype,
                        "question_count": c_count,
                        "section_name": section_name,
                        "chunk_index": c_idx,
                        "chunk_total": len(chunks),
                    })
        return batches

    if question_count <= chunk_limit:
        return [{
            "quiz_type": quiz_type,
            "question_count": question_count,
            "section_name": None,
            "chunk_index": 0,
            "chunk_total": 1,
        }]

    chunks = [
        min(chunk_limit, question_count - offset)
        for offset in range(0, question_count, chunk_limit)
    ]
    return [
        {
            "quiz_type": quiz_type,
            "question_count": c_count,
            "section_name": None,
            "chunk_index": c_idx,
            "chunk_total": len(chunks),
        }
        for c_idx, c_count in enumerate(chunks)
    ]


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
    generation_mode: str = "fast",
) -> tuple[list[dict], Optional[str]]:
    expected_count = sum(
        section.get("question_count", 0) for section in (sections or [])
    ) if sections else question_count
    expected_items = _expected_items(expected_count or 0, quiz_type, sections)

    raw_bytes = None
    if source_type == "file" and file_base64 and file_mime_type:
        raw_bytes = base64.b64decode(file_base64)

    fallback_notice: Optional[str] = None
    effective_mode = generation_mode or "fast"
    if source_type == "file" and raw_bytes is not None and file_mime_type:
        mime = file_mime_type.lower()
        name = (file_name or "").lower()
        if effective_mode == "fast":
            is_image = mime.startswith("image/") or name.endswith((".png", ".jpg", ".jpeg", ".webp"))
            if is_image:
                effective_mode = "complex"
                fallback_notice = "Switched to Complex Mode because image files need vision processing."
            elif mime == "application/pdf":
                pdf_info = _analyze_pdf(raw_bytes, "fast")
                if pdf_info["use_raw_pdf"]:
                    effective_mode = "complex"
                    fallback_notice = "Switched to Complex Mode because the PDF appears scanned or image-heavy."

    batches = _split_generation_batches(expected_count or 0, quiz_type, sections, effective_mode)
    if not batches:
        raise ValueError("Assessment requires at least one question.")

    mime_lower = (file_mime_type or "").lower()
    uses_vision_or_complex = (
        effective_mode == "complex"
        or (raw_bytes is not None and (mime_lower.startswith("image/") or mime_lower == "application/pdf"))
    )
    semaphore = asyncio.Semaphore(2 if uses_vision_or_complex else 3)

    schema_cls = CompactGeneratedQuiz if effective_mode == "fast" else GeneratedQuiz

    async def _call_router(prompt_text: str, batch_count: int) -> CompactGeneratedQuiz | GeneratedQuiz:
        return await generate_structured(
            prompt_text,
            schema_cls,
            task="generation",
            file_bytes=raw_bytes,
            mime_type=(file_mime_type if source_type == "file" else None),
            generation_mode=effective_mode,
            batch_size=batch_count,
        )

    async def _generate_batch(batch: dict) -> list[dict]:
        b_type = batch["quiz_type"]
        b_count = batch["question_count"]
        b_section = batch["section_name"]
        b_expected = [(b_type, b_section)] * b_count
        b_prompt = build_prompt(
            topic=topic,
            question_count=b_count,
            quiz_type=b_type,
            source_type=source_type,
            content_text=content_text,
            file_name=file_name,
            sections=None,
            generation_mode=effective_mode,
            section_label=b_section,
        )
        if batch["chunk_total"] > 1:
            b_prompt += (
                f"\nBatch {batch['chunk_index'] + 1} of {batch['chunk_total']}: "
                "focus on distinct concepts and subtopics not covered by other batches."
            )

        async with semaphore:
            last_error = "unknown validation error"
            attempts = 0
            while attempts < MAX_GENERATION_ATTEMPTS:
                attempts += 1
                attempt_prompt = b_prompt
                if attempts > 1:
                    attempt_prompt += (
                        f"\nThe previous response failed validation: {last_error}.\n"
                        "Generate a complete replacement array. Do not return a partial repair."
                    )

                try:
                    raw_items = [
                        normalize_generated_item(item)
                        for item in (await _call_router(attempt_prompt, b_count)).items
                    ]
                    if b_section:
                        for item in raw_items:
                            if not item.get("section_name"):
                                item["section_name"] = b_section

                    if len(raw_items) > b_count:
                        trimmed = _trim_to_expected(raw_items, b_expected)
                        if trimmed is not None:
                            logger.info(
                                "ai_generator trimmed %d surplus item(s): %d -> %d",
                                len(raw_items) - len(trimmed),
                                len(raw_items),
                                len(trimmed),
                            )
                            raw_items[:] = trimmed

                    if len(raw_items) == b_count:
                        seen_local: set[str] = set()
                        for idx_local, item in enumerate(raw_items):
                            _validate_item(item, b_type, b_section, seen_local, idx_local + 1)
                    elif len(raw_items) < b_count:
                        raw_items = _validate_items_prefix(raw_items, b_expected)
                        while len(raw_items) < b_count and attempts < MAX_GENERATION_ATTEMPTS:
                            attempts += 1
                            missing = b_count - len(raw_items)
                            top_prompt = _top_up_prompt(
                                b_prompt, raw_items, b_expected, missing, generation_mode=effective_mode
                            )
                            try:
                                new_items = [
                                    normalize_generated_item(item)
                                    for item in (await _call_router(top_prompt, missing)).items
                                ]
                                if b_section:
                                    for item in new_items:
                                        if not item.get("section_name"):
                                            item["section_name"] = b_section
                            except (ValueError, json.JSONDecodeError) as error:
                                last_error = str(error)
                                break
                            appended = _validate_new_items(new_items, raw_items, b_expected)
                            if not appended:
                                last_error = f"top-up call produced no valid items (expected {missing} more)"
                                break
                            raw_items.extend(appended[:missing])
                        if len(raw_items) != b_count:
                            raise ValueError(
                                f"Expected exactly {b_count} items but received {len(raw_items)}"
                            )
                    else:
                        raise ValueError(
                            f"Expected exactly {b_count} items but received {len(raw_items)}"
                        )
                    return raw_items
                except (ValueError, json.JSONDecodeError) as error:
                    last_error = str(error)
                except LLMRouterError:
                    raise

            raise ValueError(
                f"AI generated an invalid assessment batch after {MAX_GENERATION_ATTEMPTS} attempts: {last_error}"
            )

    batch_results = await asyncio.gather(*[_generate_batch(batch) for batch in batches])

    # Merge batches and deduplicate any cross-batch duplicate question stems.
    merged: list[dict] = []
    seen_stems: set[str] = set()
    missing_slots: list[tuple[int, str, Optional[str]]] = []
    slot_cursor = 0
    for batch_items in batch_results:
        for item in batch_items:
            expected_type, expected_section = expected_items[slot_cursor]
            stem = re.sub(r"\s+", " ", _clean_text(item.get("question")).casefold()).strip()
            if stem in seen_stems:
                missing_slots.append((slot_cursor, expected_type, expected_section))
            else:
                seen_stems.add(stem)
                merged.append(item)
            slot_cursor += 1

    if missing_slots:
        replacement_expected = [(qtype, sec) for _, qtype, sec in missing_slots]
        base_prompt = build_prompt(
            topic=topic,
            question_count=len(missing_slots),
            quiz_type=quiz_type,
            source_type=source_type,
            content_text=content_text,
            file_name=file_name,
            sections=sections,
            generation_mode=effective_mode,
        )
        top_prompt = _top_up_prompt(
            base_prompt,
            merged,
            [(item.get("quiz_type"), item.get("section_name")) for item in merged] + replacement_expected,
            len(missing_slots),
            generation_mode=effective_mode,
        )
        new_items = [
            normalize_generated_item(item)
            for item in (await _call_router(top_prompt, len(missing_slots))).items
        ]
        for new_item, (_, _, expected_section) in zip(new_items, missing_slots):
            if expected_section and not new_item.get("section_name"):
                new_item["section_name"] = expected_section
        appended = _validate_new_items(
            new_items,
            merged,
            [(item.get("quiz_type"), item.get("section_name")) for item in merged] + replacement_expected,
        )
        for (target_idx, _, _), new_item in zip(missing_slots, appended):
            merged.insert(min(target_idx, len(merged)), new_item)

    validate_quiz_data(
        merged,
        quiz_type,
        question_count=expected_count,
        sections=sections,
    )
    for item in merged:
        item.pop("question_number", None)
    return merged, fallback_notice
