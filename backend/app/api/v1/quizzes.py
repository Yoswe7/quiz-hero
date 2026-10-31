import json
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.quiz import (
    QuizRequest,
    GradeAnswerRequest,
    StudentQuizDetailResponse,
    StudentQuestionRead,
    QuizUpdateRequest,
)
from app.models import User
from app.api.dependencies import get_db_session, get_current_user, require_teacher
from app.services.quiz_service import validate_source_payload, publish_quiz_workflow
from app.services.ai_generator import generate_quiz
from app.services.ai_grader import grade_open_answer
from app.crud.crud_quiz import list_quizzes, get_quiz_by_id, delete_quiz, update_quiz

router = APIRouter()


@router.post("/generate-quiz")
async def generate_quiz_endpoint(
    request: QuizRequest,
    current_user: User = Depends(require_teacher)
):
    validate_source_payload(request)
    try:
        topic_title = (request.topic or "").strip() or (request.file_name if request.file_name else "Course Assessment")
        count = max(1, min(50, request.question_count or 10))
        raw_sections = getattr(request, "sections", None)
        sections_dict = [s.model_dump() for s in raw_sections] if raw_sections else None
        
        questions = generate_quiz(
            topic=topic_title,
            question_count=count,
            quiz_type=request.quiz_type or "Multiple Choice",
            source_type=request.source_type or "topic",
            content_text=request.content_text,
            file_base64=request.file_base64,
            file_mime_type=request.file_mime_type,
            file_name=request.file_name,
            sections=sections_dict,
        )
        return {"quiz_data": questions}
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI returned invalid JSON. Please try again.")
    except ValueError as e:
        raise HTTPException(status_code=502, detail=f"Assessment generation failed: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate quiz: {str(e)}")


@router.post("/publish-quiz")
async def publish_quiz_endpoint(
    request: QuizRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_teacher)
):
    validate_source_payload(request)
    try:
        new_quiz = await publish_quiz_workflow(request, current_user.email, db)
        return {
            "message": "Quiz published successfully", 
            "quiz": {
                "id": new_quiz.id,
                "topic": new_quiz.topic,
                "quiz_type": new_quiz.quiz_type,
                "question_count": new_quiz.question_count,
            }
        }
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI returned invalid JSON. Please try again.")
    except ValueError as e:
        raise HTTPException(status_code=502, detail=f"Assessment generation failed: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate quiz: {str(e)}")


@router.get("/quizzes")
async def list_quizzes_endpoint(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user)
):
    quizzes = await list_quizzes(db)
    return {
        "quizzes": [
            {
                "id": q.id,
                "topic": q.topic,
                "quiz_type": q.quiz_type,
                "question_count": q.question_count,
                "created_by_email": q.created_by_email,
                "created_at": q.created_at
            }
            for q in quizzes
        ]
    }


@router.get("/quizzes/{quiz_id}", response_model=StudentQuizDetailResponse)
async def get_quiz_endpoint(
    quiz_id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user)
):
    """
    Student-facing assessment fetch.
    STRICT ANTI-DEVTOOLS PROTECTION:
    Questions are serialized exclusively through StudentQuestionRead,
    which strips away all answers, correct_answers, and explanations.
    """
    quiz = await get_quiz_by_id(db, quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Assessment not found")
    
    student_questions = []
    for q in quiz.questions:
        options = [opt.option_text for opt in q.options] if getattr(q, 'options', None) else []
        sq = StudentQuestionRead(
            id=q.id,
            question=q.question_text, 
            options=options, 
            quiz_type=q.quiz_type,
            section_name=q.section_name
        )
        student_questions.append(sq)
        
    return StudentQuizDetailResponse(
        id=quiz.id,
        topic=quiz.topic,
        quiz_type=quiz.quiz_type,
        question_count=quiz.question_count,
        created_by_email=quiz.created_by_email,
        created_at=quiz.created_at,
        questions=student_questions,
    )


@router.get("/quizzes/{quiz_id}/answers")
async def get_quiz_answers_endpoint(
    quiz_id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_teacher)
):
    """
    Faculty-only answer key inspection.
    Protected strictly with require_teacher.
    """
    quiz = await get_quiz_by_id(db, quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Assessment not found")
    answers_data = []
    for q in quiz.questions:
        options = [opt.option_text for opt in q.options] if getattr(q, 'options', None) else []
        answers_data.append({
            "id": q.id,
            "question": q.question_text,
            "options": options,
            "answer": q.answer,
            "quiz_type": q.quiz_type,
            "section_name": q.section_name
        })
    return {
        "quiz_id": quiz.id,
        "topic": quiz.topic,
        "quiz_type": quiz.quiz_type,
        "questions": answers_data
    }


@router.put("/quizzes/{quiz_id}")
async def update_quiz_endpoint(
    quiz_id: str,
    request: QuizUpdateRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_teacher)
):
    """
    Update an existing assessment topic, questions, options, and answer keys.
    Protected strictly with require_teacher.
    """
    if not request.topic or not request.topic.strip():
        raise HTTPException(status_code=400, detail="Assessment topic title cannot be empty")
    if not request.questions or len(request.questions) == 0:
        raise HTTPException(status_code=400, detail="Assessment must contain at least 1 question")

    updated = await update_quiz(
        db=db,
        quiz_id=quiz_id,
        topic=request.topic,
        questions_data=[q.model_dump() for q in request.questions]
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Assessment not found")

    return {"message": "Assessment updated successfully", "quiz_id": quiz_id}


@router.delete("/quizzes/{quiz_id}")
async def delete_quiz_endpoint_handler(
    quiz_id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_teacher)
):
    success = await delete_quiz(db, quiz_id)
    if not success:
        raise HTTPException(status_code=404, detail="Assessment not found or already deleted")
        
    return {"message": "Assessment deleted successfully", "quiz_id": quiz_id}


@router.post("/grade-answer")
async def grade_answer_endpoint(
    request: GradeAnswerRequest,
    current_user: User = Depends(get_current_user)
):
    try:
        result = grade_open_answer(
            request.question, request.correct_answer, request.user_answer, request.quiz_type
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to grade answer: {str(e)}")
