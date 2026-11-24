from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.api.dependencies import get_db_session, get_current_user, require_teacher
from app.models import Quiz, User


class RetakeToggleRequest(BaseModel):
    enabled: bool
    max_attempts: int | None = Field(default=None, ge=1)


router = APIRouter(tags=["Faculty"])


@router.patch("/quizzes/{quiz_id}/retakes")
async def toggle_quiz_retakes(
    quiz_id: str,
    payload: RetakeToggleRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_teacher),
):
    """
    Faculty toggle: Enable or disable student quiz retakes per quiz.
    """
    quiz_result = await db.execute(
        select(Quiz).where(Quiz.id == quiz_id)
    )
    quiz = quiz_result.scalar_one_or_none()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found.")
    if not quiz.created_by_email or quiz.created_by_email.lower() != current_user.email.lower():
        raise HTTPException(status_code=403, detail="You can only modify retake settings for your own assessments.")

    quiz.allow_retakes = payload.enabled
    if payload.max_attempts is not None or "max_attempts" in payload.model_fields_set:
        quiz.max_attempts = payload.max_attempts
    await db.commit()
    await db.refresh(quiz)

    return {
        "message": f"Quiz retakes {'enabled' if payload.enabled else 'disabled'} successfully.",
        "quiz_id": quiz.id,
        "allow_retakes": quiz.allow_retakes,
        "max_attempts": quiz.max_attempts,
    }