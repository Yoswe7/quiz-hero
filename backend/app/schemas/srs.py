from __future__ import annotations
from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field
from uuid import UUID

class ReviewItemOut(BaseModel):
    id: UUID
    item_key: str
    prompt: Optional[str] = None
    topic: Optional[str] = None
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