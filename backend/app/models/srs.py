from __future__ import annotations
from typing import Optional
from uuid import uuid4, UUID
from datetime import datetime
from sqlmodel import SQLModel, Field, Column, String, JSON, DateTime, Integer, Float
class ReviewItem(SQLModel, table=True):
    """
    Stores spaced-repetition (SM-2) metadata for a study item.
    - user_email is used to associate the item with a user (matches existing users.email).
    - item_key can reference a question id or arbitrary identifier (e.g., 'quiz:123:item:5').
    """
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_email: str = Field(sa_column=Column("user_email", String, nullable=False), index=True)
    item_key: str = Field(sa_column=Column("item_key", String, nullable=False), index=True)
    # SM-2 fields
    repetitions: int = Field(default=0, sa_column=Column("repetitions", Integer, nullable=False))
    interval_days: int = Field(default=0, sa_column=Column("interval_days", Integer, nullable=False))
    easiness: float = Field(default=2.5, sa_column=Column("easiness", Float, nullable=False))
    last_reviewed_at: Optional[datetime] = Field(default=None, sa_column=Column("last_reviewed_at", DateTime(timezone=True), nullable=True))
    next_review_at: Optional[datetime] = Field(default=None, sa_column=Column("next_review_at", DateTime(timezone=True), nullable=True))
    # Optionally store quality history or metadata
    quality_history: Optional[dict] = Field(default=None, sa_column=Column("quality_history", JSON, nullable=True))
    created_at: datetime = Field(default_factory=datetime.utcnow, sa_column=Column("created_at", DateTime(timezone=True), nullable=False))