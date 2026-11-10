import uuid
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from app.schemas.quiz import QuizRequest
from app.models import Quiz, Question, Option, Classroom
from app.services.ai_generator import generate_quiz

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
}
MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_TEXT_CHARS = 100_000

def validate_source_payload(request: QuizRequest) -> None:
    if request.source_type == "file" or request.file_base64:
        if not request.file_base64:
            raise HTTPException(status_code=400, detail="Missing file data for file-based assessment.")
        
        estimated_bytes = (len(request.file_base64) * 3) / 4
        if estimated_bytes > MAX_FILE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"File exceeds maximum allowed size ({MAX_FILE_BYTES // (1024 * 1024)}MB). Please upload a smaller file.",
            )

        if request.file_mime_type and request.file_mime_type.lower() not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported file format '{request.file_mime_type}'. Supported: PDF, JPEG, PNG, WebP.",
            )

    if request.source_type == "text" and request.content_text:
        if len(request.content_text) > MAX_TEXT_CHARS:
            raise HTTPException(
                status_code=413,
                detail=f"Notes text exceeds maximum limit of {MAX_TEXT_CHARS} characters.",
            )

async def publish_quiz_workflow(request: QuizRequest, user_email: str, db: AsyncSession) -> Quiz:
    if not request.assigned_student_emails and not request.classroom_id:
        raise HTTPException(
            status_code=400,
            detail="Assign this assessment to a class or at least one verified CvSU student email.",
        )
    if request.available_from and request.due_at and request.available_from >= request.due_at:
        raise HTTPException(status_code=400, detail="The availability start must be before the deadline.")
    if request.classroom_id:
        classroom_result = await db.execute(
            select(Classroom).where(
                Classroom.id == request.classroom_id,
                Classroom.created_by_email == user_email,
                Classroom.is_active.is_(True),
            )
        )
        if not classroom_result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Selected class was not found or is not owned by you.")

    topic_title = (request.topic or "").strip() or (request.file_name if request.file_name else "Course Assessment")
    count = max(1, min(50, request.question_count))
    raw_sections = getattr(request, "sections", None)
    sections_dict = [s.model_dump() for s in raw_sections] if raw_sections else None

    questions_data = generate_quiz(
        topic=topic_title,
        question_count=count,
        quiz_type=request.quiz_type,
        source_type=request.source_type or "topic",
        content_text=request.content_text,
        file_base64=request.file_base64,
        file_mime_type=request.file_mime_type,
        file_name=request.file_name,
        sections=sections_dict,
    )
    
    quiz_id = str(uuid.uuid4())[:8]
    
    # Create the questions and options ORM objects
    question_objects = []
    for idx, q_data in enumerate(questions_data):
        new_q = Question(
            quiz_id=quiz_id,
            question_text=q_data["question"],
            quiz_type=q_data.get("quiz_type", request.quiz_type),
            section_name=q_data.get("section_name"),
            answer=q_data["answer"],
            order_index=idx
        )
        # Create options
        options_list = []
        for opt_idx, opt_text in enumerate(q_data.get("options", [])):
            new_opt = Option(
                option_text=opt_text,
                order_index=opt_idx
            )
            options_list.append(new_opt)
            
        new_q.options = options_list
        question_objects.append(new_q)

    new_quiz = Quiz(
        id=quiz_id,
        topic=topic_title,
        quiz_type=request.quiz_type,
        question_count=len(questions_data),
        created_by_email=user_email,
        course_code=request.course_code.strip() if request.course_code else None,
        class_section=request.class_section.strip() if request.class_section else None,
        classroom_id=request.classroom_id,
        available_from=request.available_from,
        due_at=request.due_at,
        assigned_student_emails=request.assigned_student_emails,
        is_assigned=True,
        questions=question_objects 
    )
    db.add(new_quiz)
    
    await db.commit()
    await db.refresh(new_quiz)
    
    return new_quiz
