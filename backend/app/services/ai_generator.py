import base64
import json
import re
from typing import Any, Optional

from app.core.config import get_model


QUIZ_TYPES = ("Multiple Choice", "True or False", "Identification", "Open Ended")
MAX_GENERATION_ATTEMPTS = 3


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


def validate_quiz_data(
    quiz_data: list,
    quiz_type: str,
    question_count: Optional[int] = None,
    sections: Optional[list[dict]] = None,
) -> None:
    expected_items = _expected_items(question_count or 0, quiz_type, sections)
    if not isinstance(quiz_data, list):
        raise ValueError("Response is not a JSON array")
    if len(quiz_data) != len(expected_items):
        raise ValueError(f"Expected exactly {len(expected_items)} items but received {len(quiz_data)}")

    seen_questions: set[str] = set()
    for index, item in enumerate(quiz_data):
        expected_type, expected_section = expected_items[index]
        if not isinstance(item, dict):
            raise ValueError(f"Question {index + 1} is not an object")

        question = _clean_text(item.get("question"))
        answer = _clean_text(item.get("answer"))
        item_type = item.get("quiz_type") or expected_type
        options = item.get("options")

        if not question or not answer:
            raise ValueError(f"Question {index + 1} must have non-empty question and answer text")
        if item_type != expected_type:
            raise ValueError(f"Question {index + 1} must be type '{expected_type}'")
        if expected_section and item.get("section_name") != expected_section:
            raise ValueError(f"Question {index + 1} has the wrong section")

        normalized_question = re.sub(r"\s+", " ", question.casefold()).strip()
        if normalized_question in seen_questions:
            raise ValueError(f"Question {index + 1} duplicates an earlier question")
        seen_questions.add(normalized_question)

        if not isinstance(options, list):
            raise ValueError(f"Question {index + 1} must include an options array")
        option_text = [_clean_text(option) for option in options]
        if any(not option for option in option_text):
            raise ValueError(f"Question {index + 1} contains an empty option")

        if expected_type == "Multiple Choice":
            if len(option_text) != 4 or len({option.casefold() for option in option_text}) != 4:
                raise ValueError(f"Question {index + 1} must have exactly 4 unique options")
            if answer not in option_text:
                raise ValueError(f"Question {index + 1} answer must match one option exactly")
        elif expected_type == "True or False":
            if option_text != ["True", "False"] or answer not in option_text:
                raise ValueError(f"Question {index + 1} must use True/False options and answer")
        elif expected_type == "Identification":
            if option_text or len(answer.split()) > 8 or len(answer) > 100:
                raise ValueError(f"Question {index + 1} must have one short answer and no options")
            if re.search(rf"\b{re.escape(answer.casefold())}\b", normalized_question):
                raise ValueError(f"Question {index + 1} reveals its answer")
        elif expected_type == "Open Ended":
            if option_text or len(answer) < 20:
                raise ValueError(f"Question {index + 1} needs a substantive model answer")

        item["question"] = question
        item["answer"] = answer
        item["quiz_type"] = expected_type
        item["options"] = option_text
        if expected_section:
            item["section_name"] = expected_section


def generate_quiz(
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
    model = get_model()
    expected_count = sum(
        section.get("question_count", 0) for section in (sections or [])
    ) if sections else question_count
    prompt = build_prompt(
        topic=topic,
        question_count=question_count,
        quiz_type=quiz_type,
        source_type=source_type,
        content_text=content_text,
        file_name=file_name,
        sections=sections,
    )

    if source_type == "file" and file_base64 and file_mime_type:
        raw_bytes = base64.b64decode(file_base64)
        blob_part = {
            "mime_type": file_mime_type,
            "data": raw_bytes,
        }
        source_contents = [blob_part]
    else:
        source_contents = []

    last_error = "unknown validation error"
    for attempt in range(MAX_GENERATION_ATTEMPTS):
        attempt_prompt = prompt
        if attempt > 0:
            attempt_prompt += (
                f"\nThe previous response failed validation: {last_error}.\n"
                "Generate a complete replacement array. Do not return a partial repair."
            )

        response = model.generate_content([*source_contents, attempt_prompt])
        try:
            quiz_data = extract_and_parse_json(response.text)
            validate_quiz_data(
                quiz_data,
                quiz_type,
                question_count=expected_count,
                sections=sections,
            )
            return quiz_data
        except (ValueError, json.JSONDecodeError) as error:
            last_error = str(error)

    raise ValueError(
        f"AI generated an invalid assessment after {MAX_GENERATION_ATTEMPTS} attempts: {last_error}"
    )
