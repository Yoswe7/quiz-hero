from datetime import datetime
from typing import Optional, List
from sqlmodel import SQLModel, Field
from sqlalchemy import Column, DateTime, Text, JSON, func


class CourseMaterial(SQLModel, table=True):
    __tablename__ = "course_materials"

    id: int | None = Field(default=None, primary_key=True)
    filename: str
    created_by_email: str = Field(index=True, foreign_key="users.email")
    file_hash: str = Field(index=True)
    content_hash: str = Field(index=True)
    extracted_text: str = Field(sa_column=Column(Text, nullable=False))
    pregenerated_questions_json: Optional[List[dict]] = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    status: str = Field(default="processing", index=True)
    error_message: Optional[str] = Field(default=None)
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    )