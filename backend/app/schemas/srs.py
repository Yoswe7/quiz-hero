from __future__ import annotations
from typing import Literal, Optional
from datetime import datetime
from pydantic import BaseModel, Field
from uuid import UUID

class ReviewItemOut(BaseModel):
    id: UUID
    item_key: str
    prompt: Optional[str] = None
    topic: Optional[str] = None
    correct_answer: Optional[str] = None
    explanation: Optional[str] = None
    repetitions: int
    interval_days: int
    easiness: float
    last_reviewed_at: Optional[datetime]
    next_review_at: Optional[datetime]

    model_config = {"from_attributes": True}

class ReviewRequest(BaseModel):
    quality: int = Field(ge=0, le=5)

class ReviewItemCreate(BaseModel):
    item_key: str = Field(min_length=1, max_length=255)


class LessonSectionOut(BaseModel):
    index: int
    title: str
    preview: str
    content: str
    char_count: int


class LessonParseRequest(BaseModel):
    source_type: Literal["text", "file", "material"]
    text: Optional[str] = None
    filename: Optional[str] = None
    file_base64: Optional[str] = None
    file_mime_type: Optional[str] = None
    material_id: Optional[int] = None


class LessonParseResponse(BaseModel):
    source_name: str
    sections: list[LessonSectionOut]


class SharedLessonOut(BaseModel):
    id: int
    filename: str
    created_by_email: str
    created_at: datetime
    char_count: int


class LessonSectionInput(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=20000)


class LessonGenerateRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=200)
    source_name: Optional[str] = Field(default=None, max_length=255)
    selected_sections: list[LessonSectionInput] = Field(min_length=1, max_length=30)
    card_count: int = Field(default=8, ge=1, le=25)