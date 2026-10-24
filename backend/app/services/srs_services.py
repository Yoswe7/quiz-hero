from __future__ import annotations
from datetime import datetime, timedelta
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from sqlalchemy import update

from app.models.srs import ReviewItem

MIN_EASINESS = 1.3

async def get_due_items(session: AsyncSession, user_email: str, limit: int = 50) -> List[ReviewItem]:
    """
    Return items whose next_review_at is <= now or null (new items).
    """
    now = datetime.utcnow()
    q = select(ReviewItem).where(
        ReviewItem.user_email == user_email,
    ).where(
        (ReviewItem.next_review_at == None) | (ReviewItem.next_review_at <= now)
    ).limit(limit)
    result = await session.exec(q)
    return result.scalars().all()

async def get_item(session: AsyncSession, item_id):
    q = select(ReviewItem).where(ReviewItem.id == item_id)
    res = await session.exec(q)
    return res.scalar_one_or_none()

async def create_or_get_item(session: AsyncSession, user_email: str, item_key: str) -> ReviewItem:
    q = select(ReviewItem).where(ReviewItem.user_email == user_email, ReviewItem.item_key == item_key)
    res = await session.exec(q)
    item = res.scalar_one_or_none()
    if item:
        return item
    item = ReviewItem(user_email=user_email, item_key=item_key)
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return item

async def apply_sm2(review_item: ReviewItem, quality: int, session: AsyncSession) -> ReviewItem:
    """
    Update review_item according to SM-2 rules and persist the changes.
    quality: integer 0..5
    """
    now = datetime.utcnow()

    q = max(0, min(5, int(quality)))

    # If the quality is lower than 3 => reset repetitions
    if q < 3:
        review_item.repetitions = 0
        review_item.interval_days = 1
    else:
        # successful recall
        if review_item.repetitions == 0:
            review_item.interval_days = 1
        elif review_item.repetitions == 1:
            review_item.interval_days = 6
        else:
            # Multiply by easiness and round
            review_item.interval_days = max(1, int(round(review_item.interval_days * review_item.easiness)))

        review_item.repetitions = review_item.repetitions + 1

    # Update easiness factor
    # EF':= EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    delta = (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    review_item.easiness = max(MIN_EASINESS, review_item.easiness + delta)

    review_item.last_reviewed_at = now
    review_item.next_review_at = now + timedelta(days=review_item.interval_days)

    # Append quality to history (simple)
    history = review_item.quality_history or {}
    ts = now.isoformat()
    history.setdefault("entries", []).append({"ts": ts, "q": q})
    review_item.quality_history = history

    # Persist
    session.add(review_item)
    await session.commit()
    await session.refresh(review_item)
    return review_item