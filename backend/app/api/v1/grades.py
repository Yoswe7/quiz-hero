from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.quiz import QuizSubmissionRequest
from app.models import Submission, User
from app.api.dependencies import get_db_session, get_current_user, require_teacher
from app.crud.crud_submission import create_submission, get_submissions_by_role, delete_submission
from app.crud.crud_quiz import get_quiz_by_id
from app.services.ai_grader import grade_open_answer

router = APIRouter()

@router.post("/submit-quiz")
async def submit_quiz(
    submission_req: QuizSubmissionRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user)
):
    """
    Server-side exclusive grading endpoint.
    Compares the student's submitted options directly against official DB questions.
    Answer keys are kept strictly on the server until submission is finalized.
    """
    official_quiz = await get_quiz_by_id(db, submission_req.quiz_id)
    if not official_quiz:
        raise HTTPException(status_code=404, detail="Assessment not found.")

    official_questions = official_quiz.questions or []
    total_q = len(official_questions)
    if total_q <= 0:
        raise HTTPException(status_code=400, detail="The assessment contains no registered questions.")

    calculated_score = 0.0
    verified_answers = []

    # Map user answers by question index or question text
    user_answers_list = submission_req.answers or []

    for i, q in enumerate(official_questions):
        # Match user response
        user_ans = ""
        if i < len(user_answers_list):
            user_ans = (user_answers_list[i].get("user_answer") or "").strip()
        else:
            # Fallback match by question text
            for item in user_answers_list:
                if item.get("question", "").strip().lower() == q.question_text.strip().lower():
                    user_ans = (item.get("user_answer") or "").strip()
                    break

        correct_ans = (q.answer or "").strip()
        q_type = q.quiz_type or official_quiz.quiz_type

        is_corr = False
        feedback = ""

        if q_type in ("Multiple Choice", "True or False"):
            is_corr = user_ans.strip().lower() == correct_ans.strip().lower()
            feedback = "Correct choice verified." if is_corr else f"Correct: {correct_ans}"
        elif q_type == "Identification":
            is_corr = user_ans.strip().lower() == correct_ans.strip().lower()
            if not is_corr:
                # Fuzzy check via AI grader if slight typo
                try:
                    res = grade_open_answer(q.question_text, correct_ans, user_ans, q_type)
                    is_corr = res.get("is_correct", False)
                    feedback = res.get("feedback", f"Correct: {correct_ans}")
                except Exception:
                    feedback = f"Correct: {correct_ans}"
            else:
                feedback = "Exact term match verified."
        else:
            # Open Ended grading
            try:
                res = grade_open_answer(q.question_text, correct_ans, user_ans, q_type)
                is_corr = res.get("is_correct", False)
                feedback = res.get("feedback", f"Evaluated. Correct: {correct_ans}")
            except Exception:
                is_corr = user_ans.strip().lower() == correct_ans.strip().lower()
                feedback = f"Evaluated. Correct: {correct_ans}"

        if is_corr:
            calculated_score += 1.0

        verified_answers.append({
            "question": q.question_text,
            "user_answer": user_ans,
            "correct_answer": correct_ans,
            "is_correct": is_corr,
            "ai_feedback": feedback,
        })

    percentage = round((calculated_score / max(1, total_q)) * 100, 2)

    new_sub = Submission(
        student_name=current_user.full_name or current_user.name or current_user.email.split("@")[0],
        student_email=current_user.email,
        quiz_id=submission_req.quiz_id,
        topic=official_quiz.topic,
        score=calculated_score,
        total_questions=total_q,
        percentage=percentage,
        answers=verified_answers
    )
    
    new_sub = await create_submission(db, new_sub)
    return {
        "message": "Quiz submitted and evaluated successfully.",
        "status": "ok",
        "score": calculated_score,
        "total_questions": total_q,
        "percentage": percentage,
        "answers": verified_answers,
        "submission": new_sub
    }


@router.get("/grades")
async def get_grades(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user)
):
    submissions = await get_submissions_by_role(db, current_user.role, current_user.email)
    return {"submissions": submissions}


@router.delete("/grades/{submission_id}")
async def delete_grade_endpoint(
    submission_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_teacher)
):
    success = await delete_submission(db, submission_id)
    if not success:
        raise HTTPException(status_code=404, detail="Submission not found")
        
    return {"message": "Submission deleted successfully", "id": submission_id}
