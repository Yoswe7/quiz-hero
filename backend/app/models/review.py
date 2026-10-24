from dateTime import date, datetime
from sqlalchemy import Column, DateTime, Date, func
from sqlmodel import SQLModel, Field

class QuestionReview(SQLModel, table=True):
    __tablename__ = "question_reviews"
    id: int | None = Field(default=None, primary_key=True)
    student_email: str = Field(index=True)
    question_id: int = Field(foreign_key="questions.id", index=True)
    ease_factor: float = Field(default=2.5)
    interval_days: int = Field(default=0)
    repetitions: int = Field(default=0)
    next_review_date: date = Field(default_factory=date.today)
    last_reviewed_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True))
    )