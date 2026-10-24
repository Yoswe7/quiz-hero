from __future__ import annotations
from typing import Optional
from datetime import datetime
from pydantic import BaseModel
from uuid import UUID

class ReviewItemOut(BaseModel):
    id: UUID
    item_key: str
    repetitions: int
    interval_days: int
    easiness: float
    last_reviewed_at: Optional[datetime]
    next_review_at: Optional[datetime]

    class Config:
        orm_mode = True

class ReviewRequest(BaseModel):
    quality: int  # 0-5