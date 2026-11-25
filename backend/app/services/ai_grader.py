import re

from app.schemas.ai import IdentificationGrade, OpenEndedGrade
from app.services.llm_router import generate_structured


def normalize_string(s: str) -> str:
    """Helper for fuzzy identification matching."""
    s = s.strip().lower()
    s = s.strip("\"'“”‘’`")
    s = re.sub(r"^(the|a|an)\s+", "", s)
    s = re.sub(r"[^\w\s]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


async def grade_open_answer(question: str, correct_answer: str, user_answer: str, quiz_type: str) -> dict:
    norm_user = normalize_string(user_answer)
    norm_correct = normalize_string(correct_answer)

    if not user_answer or not user_answer.strip() or not norm_user:
        return {
            "is_correct": False,
            "feedback": "No answer submitted.",
            "score": 0,
        }

    if norm_user == norm_correct:
        return {
            "is_correct": True,
            "feedback": "Correct response verified.",
            "score": 100,
        }

    if quiz_type == "Identification" and norm_user and norm_correct:
        if (norm_user + "s" == norm_correct or 
            norm_user + "es" == norm_correct or 
            norm_correct + "s" == norm_user or 
            norm_correct + "es" == norm_user):
            return {
                "is_correct": True,
                "feedback": "Correct response verified (plural/singular variation accepted).",
                "score": 100,
            }

    try:
        schema = IdentificationGrade if quiz_type == "Identification" else OpenEndedGrade
        if quiz_type == "Identification":
            prompt = f"""Grade this identification quiz answer.
Question: {question}
Correct Answer: {correct_answer}
Student Answer: {user_answer}

Respond ONLY with a JSON object:
- "is_correct": boolean (true if the student's answer is essentially correct, allowing minor typos/spelling differences)
- "feedback": A brief explanation"""
        else:
            prompt = f"""Grade this open-ended academic quiz answer.
Question: {question}
Model Answer: {correct_answer}
Student Answer: {user_answer}

Respond ONLY with a JSON object:
- "is_correct": boolean (true if the answer demonstrates understanding of the key concepts)
- "score": number from 0 to 100 representing answer quality
- "feedback": Brief constructive feedback on the answer"""

        result = await generate_structured(prompt, schema, task="grading")
        return result.model_dump()
    except Exception:
        is_close = bool(
            norm_user and norm_correct and (norm_user in norm_correct or norm_correct in norm_user)
        )
        return {
            "is_correct": is_close,
            "feedback": "Automated evaluation processed.",
            "score": 100 if is_close else 0,
        }
