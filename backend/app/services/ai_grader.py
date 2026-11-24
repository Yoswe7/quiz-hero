import re
from app.core.config import get_groq_client, settings
from app.services.ai_generator import extract_and_parse_json


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

    async with get_groq_client() as client:
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

        response = await client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.2,
            max_completion_tokens=800,
            reasoning_effort="none",
        )

    response_text = response.choices[0].message.content
    if not response_text:
        raise ValueError("Groq returned an empty grading response.")
    result = extract_and_parse_json(response_text)
    if not isinstance(result, dict) or not isinstance(result.get("is_correct"), bool):
        raise ValueError("Groq returned an invalid grading response.")
    if not isinstance(result.get("feedback"), str) or not result["feedback"].strip():
        raise ValueError("Groq returned a grading response without feedback.")
    if quiz_type != "Identification":
        score = result.get("score")
        if isinstance(score, bool) or not isinstance(score, (int, float)) or not 0 <= score <= 100:
            raise ValueError("Groq returned an invalid grading score.")
        result["score"] = float(score)
    return result
