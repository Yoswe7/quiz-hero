from datetime import datetime
from pydantic import BaseModel, Field
from typing import Any

class QuizSection(BaseModel):
    quiz_type: str
    question_count: int

class QuizRequest(BaseModel):
    topic: str | None = None
    question_count: int | None = None
    quiz_type: str | None = None
    sections: list[QuizSection] | None = None
    created_by_email: str | None = None
    source_type: str | None = None
    content_text: str | None = None
    file_base64: str | None = None
    file_mime_type: str | None = None
    file_name: str | None = None

class StudentAnswerSubmission(BaseModel):
    question: str
    user_answer: str
    question_id: int | None = None

class QuizSubmissionRequest(BaseModel):
    quiz_id: str
    topic: str
    answers: list[dict[str, Any]]
    total_questions: int | None = None
    score: float | None = None

class GradeAnswerRequest(BaseModel):
    question: str
    correct_answer: str
    user_answer: str
    quiz_type: str

class QuizSummaryResponse(BaseModel):
    id: str
    topic: str
    quiz_type: str
    question_count: int
    created_by_email: str | None = None
    created_at: datetime

class StudentQuestionRead(BaseModel):
    """
    Dedicated anti-DevTools stripped question schema for students.
    Explicitly excludes 'answer', 'correct_answer', and 'explanation'.
    """
    id: int | None = None
    question: str
    options: list[str] = []
    quiz_type: str
    section_name: str | None = None

class StudentQuizDetailResponse(BaseModel):
    id: str
    topic: str
    quiz_type: str
    question_count: int
    created_by_email: str | None = None
    created_at: datetime
    questions: list[StudentQuestionRead]

class QuestionUpdate(BaseModel):
    id: int | None = None
    question: str
    options: list[str] = []
    answer: str
    quiz_type: str | None = None
    section_name: str | None = None

class QuizUpdateRequest(BaseModel):
    topic: str
    questions: list[QuestionUpdate]

