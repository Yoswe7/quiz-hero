import json
import secrets
import string
import uuid
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.schemas.quiz import (
    QuizRequest,
    GradeAnswerRequest,
    StudentQuizDetailResponse,
    StudentQuestionRead,
    QuizUpdateRequest,
    AssignStudentRequest,
    ClassroomCreateRequest,
    JoinClassroomRequest,
    ClassroomResponse,
)
from app.models import User, Classroom, ClassroomMembership, Quiz, Submission
from app.api.dependencies import get_db_session, get_current_user, require_teacher, require_student
from app.services.quiz_service import validate_source_payload, publish_quiz_workflow
from app.services.ai_generator import generate_quiz
from app.services.ai_grader import grade_open_answer
from app.crud.crud_quiz import (
    list_quizzes,
    list_faculty_pending_assignments,
    get_quiz_by_id,
    delete_quiz,
    update_quiz,
    assign_student_to_quiz,
    quiz_is_assigned_to_student,
    quiz_is_visible_to_student,
    get_student_class_ids,
)
from app.core.rate_limit import gemini_concurrency_limit, rate_limit

router = APIRouter()


@router.post("/generate-quiz")
async def generate_quiz_endpoint(
    request: QuizRequest,
    current_user: User = Depends(require_teacher),
    _rate_limit: None = Depends(rate_limit(5, 60, authenticated=True)),
    _gemini_limit: None = Depends(gemini_concurrency_limit(authenticated=True)),
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
    current_user: User = Depends(require_teacher),
    _rate_limit: None = Depends(rate_limit(10, 60, authenticated=True)),
    _gemini_limit: None = Depends(gemini_concurrency_limit(authenticated=True)),
):
    validate_source_payload(request)
    try:
        new_quiz = await publish_quiz_workflow(request, current_user.email, db)
        persisted_quiz = await get_quiz_by_id(db, new_quiz.id)
        if not persisted_quiz:
            raise HTTPException(status_code=500, detail="Assessment was created but could not be loaded for review.")
        return {
            "message": "Assessment draft created for review.",
            "quiz": {
                "id": persisted_quiz.id,
                "topic": persisted_quiz.topic,
                "quiz_type": persisted_quiz.quiz_type,
                "question_count": persisted_quiz.question_count,
                "review_status": persisted_quiz.review_status,
                "questions": [
                    {
                        "id": question.id,
                        "question": question.question_text,
                        "options": [option.option_text for option in question.options],
                        "answer": question.answer,
                        "quiz_type": question.quiz_type,
                        "section_name": question.section_name,
                    }
                    for question in persisted_quiz.questions
                ],
            }
        }
    except HTTPException:
        raise
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
    if current_user.role.upper() == "STUDENT":
        class_ids = await get_student_class_ids(db, current_user.email)
        quizzes = [
            q for q in quizzes
            if q.review_status == "published"
            and quiz_is_visible_to_student(q, current_user.email, class_ids)
        ]
    else:
        quizzes = [
            q for q in quizzes
            if not q.created_by_email
            or q.created_by_email.lower() == current_user.email.lower()
        ]
    return {
        "quizzes": [
            {
                "id": q.id,
                "topic": q.topic,
                "quiz_type": q.quiz_type,
                "question_count": q.question_count,
                "created_by_email": q.created_by_email,
                "created_at": q.created_at,
                "course_code": q.course_code,
                "class_section": q.class_section,
                "classroom_id": q.classroom_id,
                "available_from": q.available_from,
                "due_at": q.due_at,
                "assigned_student_emails": q.assigned_student_emails or [],
                "review_status": q.review_status,
            }
            for q in quizzes
        ]
    }


@router.post("/classrooms", response_model=ClassroomResponse)
async def create_classroom_endpoint(
    request: ClassroomCreateRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_teacher),
):
    name = request.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Class name cannot be empty.")
    invite_code = "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(8))
    classroom = Classroom(
        id=str(uuid.uuid4())[:8],
        name=name,
        course_code=request.course_code.strip() if request.course_code else None,
        class_section=request.class_section.strip() if request.class_section else None,
        invite_code=invite_code,
        created_by_email=current_user.email,
    )
    db.add(classroom)
    await db.commit()
    await db.refresh(classroom)
    return classroom


@router.get("/classrooms", response_model=list[ClassroomResponse])
async def list_classrooms_endpoint(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    if current_user.role.upper() == "TEACHER":
        result = await db.execute(
            select(Classroom).where(Classroom.created_by_email == current_user.email)
        )
        return result.scalars().all()
    result = await db.execute(
        select(Classroom)
        .join(ClassroomMembership, ClassroomMembership.classroom_id == Classroom.id)
        .where(ClassroomMembership.student_email == current_user.email)
    )
    return result.scalars().all()


@router.get("/classrooms/{classroom_id}/members")
async def list_classroom_members_endpoint(
    classroom_id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_teacher),
):
    classroom_result = await db.execute(
        select(Classroom).where(
            Classroom.id == classroom_id,
            Classroom.created_by_email == current_user.email,
        )
    )
    classroom = classroom_result.scalar_one_or_none()
    if not classroom:
        raise HTTPException(status_code=404, detail="Class not found.")

    member_result = await db.execute(
        select(ClassroomMembership).where(
            ClassroomMembership.classroom_id == classroom_id
        ).order_by(ClassroomMembership.joined_at.desc())
    )
    memberships = member_result.scalars().all()
    quiz_result = await db.execute(
        select(Quiz).where(Quiz.classroom_id == classroom_id)
    )
    class_quizzes = quiz_result.scalars().all()
    submission_result = await db.execute(
        select(Submission.quiz_id, Submission.student_email).where(
            Submission.quiz_id.in_([quiz.id for quiz in class_quizzes])
        )
    ) if class_quizzes else None
    completed = {
        (quiz_id, email.strip().lower())
        for quiz_id, email in (submission_result.all() if submission_result else [])
    }

    return {
        "classroom": classroom,
        "members": [
            {
                "student_email": membership.student_email,
                "joined_at": membership.joined_at,
                "assigned_assessments": [
                    {
                        "id": quiz.id,
                        "topic": quiz.topic,
                        "completed": (quiz.id, membership.student_email.lower()) in completed,
                    }
                    for quiz in class_quizzes
                    if quiz_is_visible_to_student(quiz, membership.student_email, {classroom_id})
                    or quiz.classroom_id == classroom_id
                ],
            }
            for membership in memberships
        ],
    }


@router.post("/classrooms/join", response_model=ClassroomResponse)
async def join_classroom_endpoint(
    request: JoinClassroomRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_student),
):
    invite_code = request.invite_code.strip().upper()
    result = await db.execute(
        select(Classroom).where(
            Classroom.invite_code == invite_code,
            Classroom.is_active.is_(True),
        )
    )
    classroom = result.scalar_one_or_none()
    if not classroom:
        raise HTTPException(status_code=404, detail="Class invite code not found or inactive.")
    existing = await db.execute(
        select(ClassroomMembership).where(
            ClassroomMembership.classroom_id == classroom.id,
            ClassroomMembership.student_email == current_user.email,
        )
    )
    if not existing.scalar_one_or_none():
        db.add(ClassroomMembership(classroom_id=classroom.id, student_email=current_user.email))
        await db.commit()
    return classroom


@router.get("/faculty-assigned-assessments")
async def list_faculty_assigned_assessments_endpoint(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_teacher),
):
    return {
        "quizzes": await list_faculty_pending_assignments(db, current_user.email)
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
    if current_user.role.upper() == "STUDENT":
        if quiz.review_status != "published":
            raise HTTPException(status_code=403, detail="This assessment is still under faculty review.")
        class_ids = await get_student_class_ids(db, current_user.email)
        if not quiz_is_visible_to_student(quiz, current_user.email, class_ids):
            raise HTTPException(status_code=403, detail="This assessment is not currently available to your account.")
    
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
        course_code=quiz.course_code,
        class_section=quiz.class_section,
        available_from=quiz.available_from,
        due_at=quiz.due_at,
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
    if not quiz.created_by_email or quiz.created_by_email.lower() != current_user.email.lower():
        raise HTTPException(status_code=403, detail="You can only review your own assessments.")
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
    quiz = await get_quiz_by_id(db, quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Assessment not found")
    if not quiz.created_by_email or quiz.created_by_email.lower() != current_user.email.lower():
        raise HTTPException(status_code=403, detail="You can only edit your own assessments.")

    updated = await update_quiz(
        db=db,
        quiz_id=quiz_id,
        topic=request.topic,
        questions_data=[q.model_dump() for q in request.questions]
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Assessment not found")

    return {"message": "Assessment updated successfully", "quiz_id": quiz_id}


@router.post("/quizzes/{quiz_id}/publish")
async def publish_reviewed_quiz_endpoint(
    quiz_id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_teacher),
):
    quiz = await get_quiz_by_id(db, quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Assessment not found")
    if not quiz.created_by_email or quiz.created_by_email.lower() != current_user.email.lower():
        raise HTTPException(status_code=403, detail="You can only publish your own assessments.")
    if quiz.review_status == "published":
        return {"message": "Assessment is already published.", "quiz_id": quiz_id}
    quiz.review_status = "published"
    await db.commit()
    return {"message": "Assessment approved and published.", "quiz_id": quiz_id}


@router.post("/quizzes/{quiz_id}/assign")
async def assign_student_endpoint(
    quiz_id: str,
    request: AssignStudentRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_teacher),
):
    quiz, already_assigned = await assign_student_to_quiz(
        db=db,
        quiz_id=quiz_id,
        student_email=request.student_email,
    )
    if not quiz:
        raise HTTPException(status_code=404, detail="Assessment not found")

    return {
        "message": (
            "Assessment was already assigned to this student."
            if already_assigned
            else "Assessment assigned successfully."
        ),
        "quiz_id": quiz.id,
        "student_email": request.student_email,
        "already_assigned": already_assigned,
    }


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
    current_user: User = Depends(get_current_user),
    _rate_limit: None = Depends(rate_limit(30, 60, authenticated=True)),
    _gemini_limit: None = Depends(gemini_concurrency_limit(authenticated=True)),
):
    try:
        result = grade_open_answer(
            request.question, request.correct_answer, request.user_answer, request.quiz_type
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to grade answer: {str(e)}")
