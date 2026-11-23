from typing import Optional

from pydantic import BaseModel, Field

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

class GeneratedQuiz(BaseModel):
    """Wrapper for structured Gemini quiz output (never a bare list)."""
    items: list[QuizItem]


class IdentificationGrade(BaseModel):
    is_correct: bool
    feedback: str

class OpenEndedGrade(BaseModel):
    is_correct: bool
    score: float
    feedback: str
