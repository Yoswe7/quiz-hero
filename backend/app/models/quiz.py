from datetime import datetime
from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, DateTime, func

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
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), server_default=func.now())
    )

    questions: list[Question] = Relationship(
        back_populates="quiz",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )
