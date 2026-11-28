from typing import Any, Optional

from pydantic import BaseModel, Field, model_validator

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    user_name: str | None = None
    user_role: str | None = None
    context_topic: str | None = None

class GradeResult(BaseModel):
    is_correct: bool
    score: float | None = None
    feedback: str | None = None


class QuizItem(BaseModel):
    """Structured Gemini output for one generated question."""
    question: str
    quiz_type: str
    options: list[str] = Field(default_factory=list)
    answer: str
    section_name: Optional[str] = None
    # Internal tracker only: re-indexed by the validator and stripped before
    # saving, so DB rows and student responses are unchanged.
    question_number: Optional[int] = None

class GeneratedQuiz(BaseModel):
    """Wrapper for structured Gemini quiz output (never a bare list)."""
    items: list[QuizItem]


class CompactQuizItem(BaseModel):
    """Compact structured output for Fast Mode quiz generation (Token Diet)."""
    q: str
    t: str
    o: list[str] = Field(default_factory=list)
    a: str
    s: Optional[str] = None
    n: Optional[int] = None

    @model_validator(mode="before")
    @classmethod
    def _accept_verbose_fallback(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        mapped = dict(data)
        if "q" not in mapped and "question" in mapped:
            mapped["q"] = mapped.get("question")
        if "t" not in mapped and "quiz_type" in mapped:
            mapped["t"] = mapped.get("quiz_type")
        if "o" not in mapped and "options" in mapped:
            mapped["o"] = mapped.get("options") or []
        if "a" not in mapped and "answer" in mapped:
            mapped["a"] = mapped.get("answer")
        if "s" not in mapped and "section_name" in mapped:
            mapped["s"] = mapped.get("section_name")
        if "n" not in mapped and "question_number" in mapped:
            mapped["n"] = mapped.get("question_number")
        return mapped


class CompactGeneratedQuiz(BaseModel):
    """Wrapper for compact Fast Mode quiz output with verbose fallback support."""
    items: list[CompactQuizItem]

    @model_validator(mode="before")
    @classmethod
    def _accept_questions_key(cls, data: Any) -> Any:
        if isinstance(data, dict) and "items" not in data and "questions" in data:
            mapped = dict(data)
            mapped["items"] = mapped.get("questions") or []
            return mapped
        return data


class QuestionExplanationItem(BaseModel):
    """Lazy-backfilled explanation and optional Open-Ended rubric for one question."""
    question_id: int
    explanation: str = ""
    grading_rubric: Optional[str] = None


class QuestionExplanationBatch(BaseModel):
    """Batched lazy-backfill output for saved quiz questions."""
    items: list[QuestionExplanationItem]


class IdentificationGrade(BaseModel):
    is_correct: bool
    feedback: str

class OpenEndedGrade(BaseModel):
    is_correct: bool
    score: float
    feedback: str
