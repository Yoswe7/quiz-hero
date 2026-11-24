from datetime import datetime, timezone
from typing import Any, Optional
from sqlalchemy import Boolean, Column, DateTime, JSON, func, Integer
from sqlmodel import SQLModel, Field

class Submission(SQLModel, table=True):
    __tablename__ = "submissions"
    id: int | None = Field(default=None, primary_key=True)
    student_name: str
    student_email: str = Field(index=True)
    quiz_id: str = Field(index=True, foreign_key="quizzes.id")
    topic: str
    score: float
    total_questions: int
    percentage: float
    started_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    timed_out: bool = Field(
        default=False,
        sa_column=Column(Boolean, nullable=False, server_default=func.false()),
    )
    raw_score: float = Field(default=0.0, sa_column=Column("raw_score", nullable=False))
    adjusted_score: float | None = Field(default=None, sa_column=Column("adjusted_score", nullable=True))
    is_verified: bool = Field(default=False, sa_column=Column("is_verified", nullable=False, server_default="false"))
    faculty_remarks: str | None = Field(default=None, sa_column=Column("faculty_remarks", nullable=True))
    reviewed_by: int | None = Field(default=None, sa_column=Column("reviewed_by", nullable=True))
    reviewed_at: datetime | None = Field(
        default=None,
        sa_column=Column(
            DateTime(timezone=True), nullable=True
        ),
    )
    answers: list[dict[str, Any]] = Field(default=[], sa_column=Column(JSON))
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), server_default=func.now())
    )

    @property
    def final_score(self) -> float:
        return self.adjusted_score if self.adjusted_score is not None else self.raw_score
