from datetime import datetime
from typing import Any
from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Boolean, Column, DateTime, JSON, func

class Option(SQLModel, table=True):
    __tablename__ = "options"
    id: int | None = Field(default=None, primary_key=True)
    question_id: int = Field(foreign_key="questions.id")
    option_text: str
    order_index: int = Field(default=0)

    question: "Question" = Relationship(back_populates="options")

class Question(SQLModel, table=True):
    __tablename__ = "questions"
    id: int | None = Field(default=None, primary_key=True)
    quiz_id: str = Field(foreign_key="quizzes.id")
    question_text: str
    quiz_type: str
    section_name: str | None = Field(default=None)
    answer: str
    order_index: int = Field(default=0)

    quiz: "Quiz" = Relationship(back_populates="questions")
    options: list[Option] = Relationship(
        back_populates="question",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )

class Quiz(SQLModel, table=True):
    __tablename__ = "quizzes"
    id: str = Field(primary_key=True)
    topic: str
    quiz_type: str
    question_count: int
    created_by_email: str | None = Field(default=None, index=True, foreign_key="users.email")
    course_code: str | None = Field(default=None, index=True)
    class_section: str | None = Field(default=None, index=True)
    classroom_id: str | None = Field(default=None, index=True, foreign_key="classrooms.id")
    available_from: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    due_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    assigned_student_emails: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False, default=list),
    )
    is_assigned: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, default=False))
    review_status: str = Field(default="draft", index=True)
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), server_default=func.now())
    )

    questions: list[Question] = Relationship(
        back_populates="quiz",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )
