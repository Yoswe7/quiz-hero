from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_db_session, require_student
from app.models import Question, Quiz, ReviewItem, User
from app.schemas.srs import ReviewItemCreate, ReviewItemOut, ReviewRequest
from app.services.srs_services import (
    apply_sm2,
    create_or_get_item,
    get_due_items,
    get_item,
)

router = APIRouter(prefix="/srs")


async def _to_response(db: AsyncSession, item: ReviewItem) -> ReviewItemOut:
    prompt = None
    topic = None
    parts = item.item_key.split(":")
    if len(parts) == 4 and parts[0] == "quiz" and parts[2] == "question":
        try:
            question_id = int(parts[3])
        except ValueError:
            question_id = None
        if question_id is not None:
            question = await db.get(Question, question_id)
            if question is not None:
                prompt = question.question_text
                quiz = await db.get(Quiz, question.quiz_id)
                topic = quiz.topic if quiz else None
    return ReviewItemOut(
        id=item.id,
        item_key=item.item_key,
        prompt=prompt,
        topic=topic,
        repetitions=item.repetitions,
        interval_days=item.interval_days,
        easiness=item.easiness,
        last_reviewed_at=item.last_reviewed_at,
        next_review_at=item.next_review_at,
    )


@router.get("/due", response_model=list[ReviewItemOut])
async def list_due_reviews(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_student),
    limit: int = Query(default=50, ge=1, le=100),
):
    items = await get_due_items(db, current_user.email, limit)
    return [await _to_response(db, item) for item in items]


@router.post("/items", response_model=ReviewItemOut)
async def create_review_item(
    request: ReviewItemCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_student),
):
    item = await create_or_get_item(db, current_user.email, request.item_key.strip())
    return await _to_response(db, item)


@router.post("/{item_id}/review", response_model=ReviewItemOut)
async def review_item(
    item_id: UUID,
    request: ReviewRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_student),
):
    item = await get_item(db, item_id)
    if item is None or item.user_email.lower() != current_user.email.lower():
        raise HTTPException(status_code=404, detail="Review item not found.")
    return await _to_response(db, await apply_sm2(item, request.quality, db))
