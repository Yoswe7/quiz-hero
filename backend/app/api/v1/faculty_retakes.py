from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.api.dependencies import get_db_session, get_current_user, require_teacher
from app.models import Quiz, User
from app.core.config import settings


router = APIRouter(prefix="/faculty", tags=["Faculty"])


@router.patch("/quizzes/{quiz_id}/retakes")
async def toggle_quiz_retakes(
    quiz_id: str,
    enabled: bool,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_teacher),
):
    """
    Faculty toggle: Enable or disable student quiz retakes per quiz.
    """
    # Verify teacher owns this quiz
    quiz_result = await db.execute(
        select(Quiz).where(
            Quiz.id == quiz_id,
            Quiz.created_by_email == current_user.email
        )
    )
    quiz = quiz_result.scalar_one_or_none()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found or not owned by you")

    quiz.allow_retakes = enabled
    await db.commit()
    await db.refresh(quiz)

    return {
        "message": f"Quiz retakes {'enabled' if enabled else 'disabled'} successfully.",
        "quiz_id": quiz.id,
        "allow_retakes": quiz.allow_retakes,
    }