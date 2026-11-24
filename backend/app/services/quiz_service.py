import base64
import binascii
import hashlib
import inspect
import random
import uuid
from typing import Optional
from collections import defaultdict

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from app.schemas.quiz import QuizRequest
from app.models import Quiz, Question, Option, Classroom, CourseMaterial
from app.core.config import GROQ_MAX_IMAGE_BYTES
from app.services.ai_generator import generate_quiz, _expected_items
from app.services.llm_router import DOCX_MIME, _extract_pdf_text, _extract_docx_text

ALLOWED_MIME_TYPES = {
    "application/pdf",
    DOCX_MIME,
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
}
MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_TEXT_CHARS = 100_000
MAX_QUESTIONS_PER_ASSESSMENT = 50


def resolve_question_count(request: QuizRequest, default: Optional[int] = None) -> int:
    """Single source of truth for the effective question total.

    Mixed Assessment totals come from the section breakdown; single-type
    requests use question_count. Over-cap requests fail fast with a clear
    400 instead of burning AI retries on an impossible single completion.
    """
    sections = [s.model_dump() for s in request.sections] if request.sections else None
    if sections:
        total = sum(max(0, int(s.get("question_count", 0))) for s in sections)
        if total <= 0:
            raise HTTPException(
                status_code=400,
                detail="Mixed Assessment sections must have positive question counts.",
            )
    elif request.question_count is not None:
        total = request.question_count
        if total <= 0:
            raise HTTPException(status_code=400, detail="question_count must be a positive integer.")
    elif default is not None:
        total = default
    else:
        raise HTTPException(
            status_code=400,
            detail="Provide a positive question_count, or Mixed Assessment sections with counts.",
        )

    if total > MAX_QUESTIONS_PER_ASSESSMENT:
        raise HTTPException(
            status_code=400,
            detail=(
                f"This deployment supports up to {MAX_QUESTIONS_PER_ASSESSMENT} questions per "
                f"assessment (you requested {total}). Reduce the section counts or question count."
            ),
        )
    return total

def validate_source_payload(request: QuizRequest) -> None:
    if request.source_type == "file" or request.file_base64:
        if not request.file_base64:
            raise HTTPException(status_code=400, detail="Missing file data for file-based assessment.")
        
        encoded_file = request.file_base64
        if encoded_file.startswith("data:"):
            _, separator, encoded_file = encoded_file.partition(",")
            if not separator:
                raise HTTPException(status_code=400, detail="Invalid file data URL.")
        estimated_bytes = (len(encoded_file) * 3) / 4
        if estimated_bytes > MAX_FILE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"File exceeds maximum allowed size ({MAX_FILE_BYTES // (1024 * 1024)}MB). Please upload a smaller file.",
            )

        if request.file_mime_type and request.file_mime_type.lower() not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported file format '{request.file_mime_type}'. Supported: PDF, DOCX, JPEG, PNG, WebP.",
            )
        if not request.file_mime_type:
            raise HTTPException(status_code=400, detail="File content type is required.")
        if (
            request.file_mime_type
            and request.file_mime_type.lower().startswith("image/")
            and estimated_bytes > GROQ_MAX_IMAGE_BYTES
        ):
            raise HTTPException(
                status_code=413,
                detail="Image exceeds Groq's 14 MB limit. Please upload a smaller image.",
            )

    if request.source_type == "text" and request.content_text:
        if len(request.content_text) > MAX_TEXT_CHARS:
            raise HTTPException(
                status_code=413,
                detail=f"Notes text exceeds maximum limit of {MAX_TEXT_CHARS} characters.",
            )

def _decode_base64_file(value: str) -> bytes:
    encoded = value
    if value.startswith("data:"):
        _, separator, encoded = value.partition(",")
        if not separator:
            raise HTTPException(status_code=400, detail="Invalid file data URL.")
    try:
        return base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 payload.") from exc


def _extract_material_text(raw_bytes: bytes, mime_type: Optional[str], filename: str) -> str:
    mime = (mime_type or "").lower()
    name = (filename or "").lower()
    if mime == "application/pdf" or name.endswith(".pdf"):
        return _extract_pdf_text(raw_bytes)
    if mime in {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    } or name.endswith(".docx"):
        return _extract_docx_text(raw_bytes)
    if mime.startswith("text/") or name.endswith((".txt", ".md", ".csv")):
        try:
            return raw_bytes.decode("utf-8")
        except UnicodeDecodeError:
            return raw_bytes.decode("latin-1", errors="replace")
    return ""


def _normalize_text(text: str) -> str:
    return " ".join((text or "").lower().split())


async def resolve_course_material(request: QuizRequest, user_email: str, db: AsyncSession) -> Optional[CourseMaterial]:
    """Resolve a cached CourseMaterial per the specified priority order."""
    if getattr(request, "material_id", None) is not None:
        result = await db.execute(
            select(CourseMaterial).where(CourseMaterial.id == request.material_id)
        )
        material = result.scalar_one_or_none()
        if material is None:
            raise HTTPException(status_code=404, detail="Course material not found.")
        if (material.created_by_email or "").lower() != (user_email or "").lower():
            raise HTTPException(status_code=403, detail="You do not own this course material.")
        return material

    if request.file_base64:
        raw_bytes = _decode_base64_file(request.file_base64)
        file_hash = hashlib.sha256(raw_bytes).hexdigest()

        result = await db.execute(
            select(CourseMaterial).where(
                CourseMaterial.file_hash == file_hash,
                CourseMaterial.status == "ready",
            )
        )
        material = result.scalars().first()
        if material is not None:
            return material

        extracted_text = _extract_material_text(raw_bytes, request.file_mime_type, request.file_name or "")
        content_hash = hashlib.sha256(_normalize_text(extracted_text).encode("utf-8")).hexdigest()

        result = await db.execute(
            select(CourseMaterial).where(
                CourseMaterial.content_hash == content_hash,
                CourseMaterial.status == "ready",
            )
        )
        material = result.scalars().first()
        if material is not None:
            return material

    return None


def _conflicting_custom_instructions(request: QuizRequest) -> bool:
    if (getattr(request, "content_text", None) or "").strip():
        return True
    if getattr(request, "generation_mode", "fast") not in (None, "fast"):
        return True
    return False


def try_instant_cache(material: Optional[CourseMaterial], request: QuizRequest) -> Optional[list[dict]]:
    """Return a shuffled slice from the cached pool when possible, else None."""
    if material is None or material.status != "ready":
        return None
    if _conflicting_custom_instructions(request):
        return None

    pool = list(material.pregenerated_questions_json or [])
    if not pool:
        return None

    sections = [s.model_dump() if hasattr(s, "model_dump") else s for s in (request.sections or [])]
    sections_dict = sections if sections else None

    try:
        total_count = resolve_question_count(request)
    except Exception:
        total_count = request.question_count or 0

    try:
        expected = _expected_items(
            total_count,
            request.quiz_type or "Multiple Choice",
            sections_dict,
        )
    except Exception:
        qtype = request.quiz_type or "Multiple Choice"
        expected = [(qtype, None)] * total_count

    # Check pool coverage by quiz type.
    available_by_type: dict[str, list[dict]] = defaultdict(list)
    for item in pool:
        available_by_type[item.get("quiz_type")].append(dict(item))

    needed_by_type: dict[str, int] = defaultdict(int)
    for qtype, _ in expected:
        needed_by_type[qtype] += 1

    for qtype, needed in needed_by_type.items():
        if len(available_by_type.get(qtype, [])) < needed:
            return None

    # Select items per expected slot.
    shuffled_pool = list(pool)
    random.shuffle(shuffled_pool)
    by_type: dict[str, list[dict]] = defaultdict(list)
    for item in shuffled_pool:
        by_type[item.get("quiz_type")].append(dict(item))

    result: list[dict] = []
    for qtype, section_name in expected:
        item = by_type[qtype].pop()
        item["quiz_type"] = qtype
        if section_name and not item.get("section_name"):
            item["section_name"] = section_name
        result.append(item)

    if len(result) != len(expected):
        return None

    random.shuffle(result)
    return result


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
    raw_sections = getattr(request, "sections", None)
    sections_dict = [s.model_dump() for s in raw_sections] if raw_sections else None
    count = resolve_question_count(request)

    material = await resolve_course_material(request, user_email, db)

    served_from_cache = False
    fallback_notice = None
    questions_data = None

    cached = try_instant_cache(material, request)
    if cached is not None:
        questions_data = cached
        served_from_cache = True
    elif material is not None:
        gen_res = generate_quiz(
            topic=topic_title,
            question_count=count,
            quiz_type=request.quiz_type,
            source_type="text",
            content_text=material.extracted_text,
            file_base64=None,
            file_mime_type=None,
            file_name=request.file_name,
            sections=sections_dict,
            generation_mode="fast",
        )
        gen_result = await gen_res if inspect.isawaitable(gen_res) else gen_res
        questions_data, fallback_notice = gen_result
    else:
        gen_res = generate_quiz(
            topic=topic_title,
            question_count=count,
            quiz_type=request.quiz_type,
            source_type=request.source_type or "topic",
            content_text=request.content_text,
            file_base64=request.file_base64,
            file_mime_type=request.file_mime_type,
            file_name=request.file_name,
            sections=sections_dict,
            generation_mode=request.generation_mode,
        )
        gen_result = await gen_res if inspect.isawaitable(gen_res) else gen_res
        questions_data, fallback_notice = gen_result

    request._fallback_notice = fallback_notice
    request._served_from_cache = served_from_cache
    
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
        review_status="draft",
        time_limit_minutes=request.time_limit_minutes,
        questions=question_objects 
    )
    db.add(new_quiz)
    
    await db.commit()
    await db.refresh(new_quiz)
    
    return new_quiz, getattr(request, "_fallback_notice", None)
