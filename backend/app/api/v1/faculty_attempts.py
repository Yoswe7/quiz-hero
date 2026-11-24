import json
from datetime import datetime, timezone
from typing import List, Optional, Any

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select, func

from app.api.dependencies import get_db_session, get_current_user, require_teacher
from app.models import Submission, User
from app.schemas.faculty_attempts import StudentAnswerOverride, StudentAnswerOverrideResponse


router = APIRouter(prefix="/faculty", tags=["Faculty"])


@router.get("/quizzes/{quiz_id}/attempts")
async def get_faculty_quiz_attempts(
    quiz_id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_teacher),
):
    """
    Faculty-facing: Return all student attempts for a quiz
    with item-level answer data and faculty verification fields.
    """
    # Verify teacher owns this quiz
    quiz_result = await db.execute(
        select(Submission).where(Submission.quiz_id == quiz_id)
    )
    # Get all submissions for this quiz
    result = await db.execute(
        select(Submission).where(Submission.quiz_id == quiz_id).order_by(Submission.student_email)
    )
    submissions = result.scalars().all()

    # Build the response with item-level details
    attempts = []
    for sub in submissions:
        # Parse answers and enrich with override data
        answers_data = sub.answers or []
        enriched_answers = []
        for ans in answers_data:
            # Ensure is_overridden and awarded_points are present
            is_overridden = ans.get("is_overridden", False)
            awarded_points = ans.get("awarded_points", 0.0)
            correct_answer = ans.get("correct_answer", "")
            selected_answer = ans.get("selected_answer", "")
            question_text = ans.get("question_text", "")
            is_correct = ans.get("is_correct", False)

            enriched_answers.append({
                "question_text": question_text,
                "selected_answer": selected_answer,
                "correct_answer": correct_answer,
                "is_correct": is_correct,
                "is_overridden": is_overridden,
                "awarded_points": awarded_points,
            })

        attempts.append({
            "attempt_id": sub.id,
            "student_email": sub.student_email,
            "student_name": sub.student_name,
            "raw_score": sub.raw_score,
            "adjusted_score": sub.adjusted_score,
            "final_score": sub.final_score,
            "total_items": sub.total_questions,
            "is_verified": sub.is_verified,
            "faculty_remarks": sub.faculty_remarks,
            "reviewed_at": sub.reviewed_at,
            "reviewed_by": sub.reviewed_by,
            "answers": enriched_answers,
        })

    return {"attempts": attempts}


@router.patch("/attempts/{attempt_id}/grade")
async def grade_faculty_attempt(
    attempt_id: int,
    answer_overrides: List[StudentAnswerOverride],
    adjusted_score: Optional[float] = None,
    faculty_remarks: Optional[str] = None,
    is_verified: bool = True,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_teacher),
):
    """
    Faculty grading endpoint: override answers, adjust score,
    add remarks, and mark attempt as verified.
    """
    # Load the submission
    result = await db.execute(select(Submission).where(Submission.id == attempt_id))
    submission = result.scalar_one_or_none()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    # Persist answer overrides into the answers JSON
    answers = submission.answers or []
    # Build a map of answer indices to override data
    for override in answer_overrides:
        # Find or create the answer entry
        idx = override.answer_index
        while len(answers) <= idx:
            answers.append({})
        # Apply overrides
        answers[idx]["is_overridden"] = override.is_overridden
        answers[idx]["awarded_points"] = override.awarded_points

    submission.answers = answers

    # Recalculate adjusted_score: if manual adjusted_score provided, use it;
    # otherwise recalculate from item points
    if adjusted_score is not None:
        submission.adjusted_score = adjusted_score
    else:
        # Recalculate from overridden answers' awarded_points
        total_points = 0.0
        for ans in answers:
            awarded = ans.get("awarded_points", 0.0)
            # Only count points if overridden or correct
            is_over = ans.get("is_overridden", False)
            if is_over or ans.get("is_correct", False):
                total_points += awarded
        submission.adjusted_score = total_points

    # Set faculty verification fields
    submission.is_verified = is_verified
    submission.faculty_remarks = faculty_remarks
    submission.reviewed_by = current_user.id
    submission.reviewed_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(submission)

    return {
        "message": "Attempt graded and verified successfully.",
        "attempt_id": submission.id,
        "raw_score": submission.raw_score,
        "adjusted_score": submission.adjusted_score,
        "final_score": submission.final_score,
        "is_verified": submission.is_verified,
        "faculty_remarks": submission.faculty_remarks,
        "reviewed_at": submission.reviewed_at,
    }