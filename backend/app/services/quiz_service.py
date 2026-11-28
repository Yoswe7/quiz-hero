import asyncio
import base64
import binascii
import hashlib
import inspect
import json
import logging
import random
import uuid
import weakref
from typing import AsyncGenerator, Optional
from collections import defaultdict

from fastapi import BackgroundTasks, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlmodel import select
from app.api.dependencies import async_session_maker
from app.schemas.ai import QuestionExplanationBatch
from app.schemas.quiz import QuizRequest
from app.models import Quiz, Question, Option, Classroom, CourseMaterial, MaterialQuestionPool
from app.core.config import GROQ_MAX_IMAGE_BYTES
from app.services.ai_generator import generate_quiz, _expected_items
from app.services.llm_router import DOCX_MIME, _analyze_pdf, _extract_pdf_text, _extract_docx_text, generate_structured

logger = logging.getLogger("quiz_hero.quiz_service")
SessionLocal = async_session_maker
_POOL_WARM_SEMAPHORES: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Semaphore] = (
    weakref.WeakKeyDictionary()
)


def get_pool_warm_semaphore() -> asyncio.Semaphore:
    """Return a per-event-loop Semaphore(1) so background pool warming stays sequential."""
    loop = asyncio.get_running_loop()
    sem = _POOL_WARM_SEMAPHORES.get(loop)
    if sem is None:
        sem = asyncio.Semaphore(1)
        _POOL_WARM_SEMAPHORES[loop] = sem
    return sem


def compute_question_fingerprint(question_text: str) -> str:
    """Normalized stem SHA-256 hash used to deduplicate MaterialQuestionPool rows."""
    normalized = " ".join((question_text or "").casefold().split())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()

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


def should_use_visual_file(request: QuizRequest) -> bool:
    """Return True when Complex Mode should keep the raw file for vision processing."""
    if getattr(request, "generation_mode", "fast") != "complex":
        return False
    if not request.file_base64 or not request.file_mime_type:
        return False
    mime_lower = request.file_mime_type.lower()
    if mime_lower.startswith("image/"):
        return True
    if mime_lower == "application/pdf":
        raw_bytes = _decode_base64_file(request.file_base64)
        return bool(_analyze_pdf(raw_bytes, "complex")["use_raw_pdf"])
    return False


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


async def append_questions_to_pool(
    material_id: int,
    questions: list[dict],
    db: Optional[AsyncSession] = None,
) -> int:
    """Deduplicate questions by normalized stem fingerprint and append to MaterialQuestionPool."""
    if not questions:
        return 0

    own_session = db is None
    session = SessionLocal() if own_session else db
    inserted = 0
    try:
        existing_result = await session.execute(
            select(MaterialQuestionPool.fingerprint).where(
                MaterialQuestionPool.material_id == material_id
            )
        )
        seen_fingerprints = set(existing_result.scalars().all())

        new_rows: list[MaterialQuestionPool] = []
        for raw_q in questions:
            if not isinstance(raw_q, dict):
                continue
            stem = (raw_q.get("question") or "").strip()
            qtype = (raw_q.get("quiz_type") or "").strip()
            if not stem or not qtype:
                continue
            fp = compute_question_fingerprint(stem)
            if fp in seen_fingerprints:
                continue
            seen_fingerprints.add(fp)
            stored_json = dict(raw_q)
            stored_json.pop("section_name", None)
            new_rows.append(
                MaterialQuestionPool(
                    material_id=material_id,
                    question_type=qtype,
                    question_json=stored_json,
                    fingerprint=fp,
                )
            )

        if new_rows:
            session.add_all(new_rows)
            try:
                await session.commit()
                inserted = len(new_rows)
            except IntegrityError:
                await session.rollback()
                inserted = 0
                for row in new_rows:
                    try:
                        session.add(row)
                        await session.commit()
                        inserted += 1
                    except IntegrityError:
                        await session.rollback()
        return inserted
    finally:
        if own_session:
            await session.close()


async def assemble_quiz_from_pool_and_llm(
    request: QuizRequest,
    material: Optional[CourseMaterial],
    db: AsyncSession,
    *,
    topic_title: str,
    count: int,
    sections_dict: Optional[list[dict]],
) -> tuple[list[dict], Optional[str], bool]:
    """Slice ready questions from MaterialQuestionPool first; only call the LLM
    for any missing delta, then append newly generated items back to the pool.
    """
    use_visual = should_use_visual_file(request)
    has_custom_text = bool((getattr(request, "content_text", None) or "").strip())
    can_use_pool = (
        material is not None
        and not use_visual
        and not has_custom_text
        and getattr(request, "generation_mode", "fast") == "fast"
    )

    if can_use_pool:
        expected = _expected_items(count, request.quiz_type or "Multiple Choice", sections_dict)
        needed_types = {qtype for qtype, _ in expected}

        pool_result = await db.execute(
            select(MaterialQuestionPool).where(
                MaterialQuestionPool.material_id == material.id,
                MaterialQuestionPool.question_type.in_(needed_types),
            )
        )
        pool_rows = pool_result.scalars().all()

        buckets: dict[str, list[tuple[str, dict]]] = defaultdict(list)
        for row in pool_rows:
            if isinstance(row.question_json, dict):
                buckets[row.question_type].append((row.fingerprint, dict(row.question_json)))

        # Backward compatibility: fall back to legacy pregenerated_questions_json if pool table has none.
        if not pool_rows and isinstance(material.pregenerated_questions_json, list):
            for legacy_item in material.pregenerated_questions_json:
                if not isinstance(legacy_item, dict):
                    continue
                qtype = legacy_item.get("quiz_type")
                if qtype in needed_types:
                    fp = compute_question_fingerprint(legacy_item.get("question", ""))
                    buckets[qtype].append((fp, dict(legacy_item)))

        for qtype in buckets:
            random.shuffle(buckets[qtype])

        assembled: list[Optional[dict]] = [None] * len(expected)
        used_fingerprints: set[str] = set()
        missing_slots: list[tuple[int, str, Optional[str]]] = []

        for idx, (qtype, section_name) in enumerate(expected):
            picked: Optional[dict] = None
            bucket = buckets.get(qtype, [])
            while bucket:
                fp, candidate = bucket.pop()
                if fp in used_fingerprints:
                    continue
                used_fingerprints.add(fp)
                candidate["quiz_type"] = qtype
                if section_name:
                    candidate["section_name"] = section_name
                else:
                    candidate.pop("section_name", None)
                picked = candidate
                break

            if picked is not None:
                assembled[idx] = picked
            else:
                missing_slots.append((idx, qtype, section_name))

        if not missing_slots:
            return [item for item in assembled if item is not None], None, True

        # Generate only the missing delta.
        delta_counts_by_group: dict[tuple[str, Optional[str]], int] = defaultdict(int)
        for _, qtype, section_name in missing_slots:
            delta_counts_by_group[(qtype, section_name)] += 1

        if len(delta_counts_by_group) == 1 and next(iter(delta_counts_by_group))[1] is None:
            (delta_type, _), delta_count = next(iter(delta_counts_by_group.items()))
            delta_sections = None
        else:
            delta_type = "Mixed Assessment"
            delta_count = len(missing_slots)
            delta_sections = [
                {"quiz_type": qtype, "question_count": grp_count}
                for (qtype, _), grp_count in delta_counts_by_group.items()
            ]

        gen_res = generate_quiz(
            topic=topic_title,
            question_count=delta_count,
            quiz_type=delta_type,
            source_type="text",
            content_text=material.extracted_text,
            file_base64=None,
            file_mime_type=None,
            file_name=request.file_name,
            sections=delta_sections,
            generation_mode="fast",
        )
        gen_result = await gen_res if inspect.isawaitable(gen_res) else gen_res
        delta_questions, fallback_notice = gen_result

        # Place delta items back into their missing slots by matching quiz_type.
        delta_by_type: dict[str, list[dict]] = defaultdict(list)
        for dq in delta_questions:
            delta_by_type[dq.get("quiz_type")].append(dict(dq))

        for slot_idx, qtype, section_name in missing_slots:
            if delta_by_type.get(qtype):
                item = delta_by_type[qtype].pop(0)
            else:
                item = dict(delta_questions.pop(0))
            item["quiz_type"] = qtype
            if section_name:
                item["section_name"] = section_name
            else:
                item.pop("section_name", None)
            assembled[slot_idx] = item

        await append_questions_to_pool(material.id, delta_questions, db=db)
        return [item for item in assembled if item is not None], fallback_notice, False

    # Non-pool path (no material, visual file, custom content_text, or Complex Mode)
    if material is not None and not use_visual and not has_custom_text:
        gen_res = generate_quiz(
            topic=topic_title,
            question_count=count,
            quiz_type=request.quiz_type or "Multiple Choice",
            source_type="text",
            content_text=material.extracted_text,
            file_base64=None,
            file_mime_type=None,
            file_name=request.file_name,
            sections=sections_dict,
            generation_mode=request.generation_mode,
        )
        gen_result = await gen_res if inspect.isawaitable(gen_res) else gen_res
        questions_data, fallback_notice = gen_result
        await append_questions_to_pool(material.id, questions_data, db=db)
        return questions_data, fallback_notice, False

    gen_res = generate_quiz(
        topic=topic_title,
        question_count=count,
        quiz_type=request.quiz_type or ("Mixed Assessment" if sections_dict else "Multiple Choice"),
        source_type="file" if use_visual else (request.source_type or "topic"),
        content_text=None if use_visual else request.content_text,
        file_base64=request.file_base64 if (use_visual or request.source_type == "file") else None,
        file_mime_type=request.file_mime_type if (use_visual or request.source_type == "file") else None,
        file_name=request.file_name,
        sections=sections_dict,
        generation_mode=request.generation_mode,
    )
    gen_result = await gen_res if inspect.isawaitable(gen_res) else gen_res
    questions_data, fallback_notice = gen_result
    return questions_data, fallback_notice, False


async def prepare_publish_context(
    request: QuizRequest,
    user_email: str,
    db: AsyncSession,
) -> tuple[str, Optional[list[dict]], int]:
    """Validate publish request constraints and return (topic_title, sections_dict, count)."""
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
    return topic_title, sections_dict, count


async def save_draft_quiz_from_questions(
    request: QuizRequest,
    user_email: str,
    db: AsyncSession,
    *,
    topic_title: str,
    questions_data: list[dict],
) -> Quiz:
    """Persist generated questions/options as a draft Quiz and return the committed Quiz."""
    quiz_id = str(uuid.uuid4())[:8]

    question_objects = []
    for idx, q_data in enumerate(questions_data):
        new_q = Question(
            quiz_id=quiz_id,
            question_text=q_data["question"],
            quiz_type=q_data.get("quiz_type", request.quiz_type),
            section_name=q_data.get("section_name"),
            answer=q_data["answer"],
            explanation=q_data.get("explanation") or "",
            grading_rubric=q_data.get("grading_rubric") or None,
            order_index=idx,
        )
        options_list = [
            Option(option_text=opt_text, order_index=opt_idx)
            for opt_idx, opt_text in enumerate(q_data.get("options", []))
        ]
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
        question_time_limit_seconds=request.question_time_limit_seconds,
        questions=question_objects,
    )
    db.add(new_quiz)
    await db.commit()
    await db.refresh(new_quiz)
    return new_quiz


async def stream_publish_quiz_events(
    request: QuizRequest,
    http_request: Request,
    user_email: str,
    background_tasks: BackgroundTasks,
    *,
    topic_title: str,
    sections_dict: Optional[list[dict]],
    count: int,
    material: Optional[CourseMaterial],
) -> AsyncGenerator[str, None]:
    """Stream NDJSON status/question/done/error events for progressive draft creation."""
    pending_tasks: list[asyncio.Task] = []
    try:
        expected = _expected_items(count, request.quiz_type or "Multiple Choice", sections_dict)
        use_visual = should_use_visual_file(request)
        has_custom_text = bool((getattr(request, "content_text", None) or "").strip())
        can_use_pool = (
            material is not None
            and not use_visual
            and not has_custom_text
            and getattr(request, "generation_mode", "fast") == "fast"
        )

        assembled: list[Optional[dict]] = [None] * len(expected)
        missing_slots: list[tuple[int, str, Optional[str]]] = []
        fallback_notice: Optional[str] = None
        served_from_cache = False

        if can_use_pool:
            yield json.dumps({"event": "status", "message": "Checking prepared question pool..."}) + "\n"
            needed_types = {qtype for qtype, _ in expected}
            pool_session = SessionLocal()
            try:
                pool_result = await pool_session.execute(
                    select(MaterialQuestionPool).where(
                        MaterialQuestionPool.material_id == material.id,
                        MaterialQuestionPool.question_type.in_(needed_types),
                    )
                )
                pool_rows = pool_result.scalars().all()
            finally:
                await pool_session.close()

            buckets: dict[str, list[tuple[str, dict]]] = defaultdict(list)
            for row in pool_rows:
                if isinstance(row.question_json, dict):
                    buckets[row.question_type].append((row.fingerprint, dict(row.question_json)))

            if not pool_rows and isinstance(material.pregenerated_questions_json, list):
                for legacy_item in material.pregenerated_questions_json:
                    if isinstance(legacy_item, dict) and legacy_item.get("quiz_type") in needed_types:
                        fp = compute_question_fingerprint(legacy_item.get("question", ""))
                        buckets[legacy_item["quiz_type"]].append((fp, dict(legacy_item)))

            for qtype in buckets:
                random.shuffle(buckets[qtype])

            used_fingerprints: set[str] = set()
            pool_hits = 0
            for idx, (qtype, section_name) in enumerate(expected):
                picked: Optional[dict] = None
                bucket = buckets.get(qtype, [])
                while bucket:
                    fp, candidate = bucket.pop()
                    if fp in used_fingerprints:
                        continue
                    used_fingerprints.add(fp)
                    candidate["quiz_type"] = qtype
                    if section_name:
                        candidate["section_name"] = section_name
                    else:
                        candidate.pop("section_name", None)
                    picked = candidate
                    break

                if picked is not None:
                    assembled[idx] = picked
                    pool_hits += 1
                    if await http_request.is_disconnected():
                        return
                    yield json.dumps({
                        "event": "question",
                        "section": section_name or qtype,
                        "data": picked,
                    }) + "\n"
                else:
                    missing_slots.append((idx, qtype, section_name))

            if not missing_slots:
                served_from_cache = True
        else:
            missing_slots = [(idx, qtype, section_name) for idx, (qtype, section_name) in enumerate(expected)]

        if missing_slots:
            grouped_slots: dict[tuple[str, Optional[str]], list[int]] = defaultdict(list)
            for slot_idx, qtype, section_name in missing_slots:
                grouped_slots[(qtype, section_name)].append(slot_idx)

            yield json.dumps({
                "event": "status",
                "message": f"Generating {len(missing_slots)} question(s) across {len(grouped_slots)} section(s)...",
            }) + "\n"

            async def _run_section_task(
                sec_qtype: str,
                sec_name: Optional[str],
                slot_indices: list[int],
            ) -> tuple[str, Optional[str], list[int], list[dict], Optional[str]]:
                if material is not None and not use_visual and not has_custom_text:
                    src_type = "text"
                    txt = material.extracted_text
                    f_b64 = None
                    f_mime = None
                else:
                    src_type = "file" if use_visual else (request.source_type or "topic")
                    txt = None if use_visual else request.content_text
                    f_b64 = request.file_base64 if (use_visual or request.source_type == "file") else None
                    f_mime = request.file_mime_type if (use_visual or request.source_type == "file") else None

                sec_sections = (
                    [{"quiz_type": sec_qtype, "question_count": len(slot_indices)}]
                    if sec_name
                    else None
                )
                sec_questions, sec_notice = await generate_quiz(
                    topic=topic_title,
                    question_count=len(slot_indices),
                    quiz_type="Mixed Assessment" if sec_name else sec_qtype,
                    source_type=src_type,
                    content_text=txt,
                    file_base64=f_b64,
                    file_mime_type=f_mime,
                    file_name=request.file_name,
                    sections=sec_sections,
                    generation_mode=request.generation_mode,
                )
                return sec_qtype, sec_name, slot_indices, sec_questions, sec_notice

            pending_tasks = [
                asyncio.create_task(_run_section_task(sec_qtype, sec_name, slot_indices))
                for (sec_qtype, sec_name), slot_indices in grouped_slots.items()
            ]

            for completed_task in asyncio.as_completed(pending_tasks):
                if await http_request.is_disconnected():
                    return
                sec_qtype, sec_name, slot_indices, sec_questions, sec_notice = await completed_task
                if sec_notice and not fallback_notice:
                    fallback_notice = sec_notice

                yield json.dumps({
                    "event": "status",
                    "message": f"Completed {sec_name or sec_qtype} ({len(sec_questions)} items)",
                }) + "\n"

                for slot_idx, q_item in zip(slot_indices, sec_questions):
                    q_copy = dict(q_item)
                    q_copy["quiz_type"] = sec_qtype
                    if sec_name:
                        q_copy["section_name"] = sec_name
                    else:
                        q_copy.pop("section_name", None)
                    assembled[slot_idx] = q_copy
                    if await http_request.is_disconnected():
                        return
                    yield json.dumps({
                        "event": "question",
                        "section": sec_name or sec_qtype,
                        "data": q_copy,
                    }) + "\n"

                if material is not None and not use_visual and not has_custom_text:
                    await append_questions_to_pool(material.id, sec_questions)

        if await http_request.is_disconnected():
            return

        final_questions = [item for item in assembled if item is not None]
        save_db = SessionLocal()
        try:
            saved_quiz = await save_draft_quiz_from_questions(
                request,
                user_email,
                save_db,
                topic_title=topic_title,
                questions_data=final_questions,
            )
            stmt = (
                select(Quiz)
                .where(Quiz.id == saved_quiz.id)
                .options(selectinload(Quiz.questions).selectinload(Question.options))
            )
            persisted_quiz = (await save_db.execute(stmt)).scalar_one()
            quiz_payload = {
                "id": persisted_quiz.id,
                "topic": persisted_quiz.topic,
                "quiz_type": persisted_quiz.quiz_type,
                "question_count": persisted_quiz.question_count,
                "review_status": persisted_quiz.review_status,
                "question_time_limit_seconds": persisted_quiz.question_time_limit_seconds,
                "questions": [
                    {
                        "id": q.id,
                        "question": q.question_text,
                        "options": [opt.option_text for opt in q.options],
                        "answer": q.answer,
                        "explanation": q.explanation or "",
                        "grading_rubric": q.grading_rubric,
                        "quiz_type": q.quiz_type,
                        "section_name": q.section_name,
                    }
                    for q in persisted_quiz.questions
                ],
            }
        finally:
            await save_db.close()

        if any(
            not (q.get("explanation") or "").strip()
            or (q.get("quiz_type") == "Open Ended" and not (q.get("grading_rubric") or "").strip())
            for q in quiz_payload["questions"]
        ):
            background_tasks.add_task(backfill_quiz_explanations, quiz_payload["id"])

        yield json.dumps({
            "event": "done",
            "quiz_id": quiz_payload["id"],
            "fallback_notice": fallback_notice,
            "served_from_cache": served_from_cache,
            "quiz": quiz_payload,
        }) + "\n"
    except asyncio.CancelledError:
        return
    except Exception as exc:
        yield json.dumps({"event": "error", "detail": str(exc)}) + "\n"
    finally:
        for task in pending_tasks:
            if not task.done():
                task.cancel()


async def publish_quiz_workflow(request: QuizRequest, user_email: str, db: AsyncSession) -> Quiz:
    topic_title, sections_dict, count = await prepare_publish_context(request, user_email, db)

    material = await resolve_course_material(request, user_email, db)

    questions_data, fallback_notice, served_from_cache = await assemble_quiz_from_pool_and_llm(
        request,
        material,
        db,
        topic_title=topic_title,
        count=count,
        sections_dict=sections_dict,
    )

    request._fallback_notice = fallback_notice
    request._served_from_cache = served_from_cache

    new_quiz = await save_draft_quiz_from_questions(
        request,
        user_email,
        db,
        topic_title=topic_title,
        questions_data=questions_data,
    )
    return new_quiz, getattr(request, "_fallback_notice", None)


async def backfill_quiz_explanations(quiz_id: str) -> None:
    """Generate concise 1-2 sentence explanations (and Open-Ended rubrics) in a
    single batched LLM call using a fresh DB session isolated from the request.
    """
    pending_payload: list[dict] = []
    db: AsyncSession = SessionLocal()
    try:
        result = await db.execute(
            select(Question)
            .where(Question.quiz_id == quiz_id)
            .order_by(Question.order_index)
        )
        questions = result.scalars().all()
        for q in questions:
            needs_explanation = not (q.explanation or "").strip()
            needs_rubric = q.quiz_type == "Open Ended" and not (q.grading_rubric or "").strip()
            if (needs_explanation or needs_rubric) and q.id is not None:
                pending_payload.append({
                    "question_id": q.id,
                    "quiz_type": q.quiz_type,
                    "question": q.question_text,
                    "answer": q.answer,
                })
    finally:
        await db.close()

    if not pending_payload:
        return

    prompt = (
        "Generate concise 1-2 sentence explanations for each assessment question below.\n"
        "For items with quiz_type == 'Open Ended', also provide a short 'grading_rubric' "
        "(1-2 sentences listing key criteria for full credit). For all other types, set "
        "'grading_rubric' to null.\n"
        "Return an 'items' array matching every 'question_id' provided.\n\n"
        + json.dumps(pending_payload, ensure_ascii=False)
    )

    try:
        batch_result = await generate_structured(
            prompt,
            QuestionExplanationBatch,
            task="generation",
            generation_mode="fast",
        )
    except Exception as exc:
        logger.warning("Lazy explanation backfill LLM call failed for quiz %s: %s", quiz_id, exc)
        return

    updates_by_id = {
        item.question_id: item
        for item in getattr(batch_result, "items", [])
    }
    if not updates_by_id:
        return

    db = SessionLocal()
    try:
        result = await db.execute(
            select(Question).where(Question.quiz_id == quiz_id)
        )
        questions = result.scalars().all()
        updated_any = False
        for q in questions:
            item = updates_by_id.get(q.id)
            if item is None:
                continue
            explanation = (item.explanation or "").strip()
            if explanation and not (q.explanation or "").strip():
                q.explanation = explanation
                updated_any = True
            rubric = (item.grading_rubric or "").strip()
            if rubric and q.quiz_type == "Open Ended" and not (q.grading_rubric or "").strip():
                q.grading_rubric = rubric
                updated_any = True
        if updated_any:
            await db.commit()
    except Exception as exc:
        logger.warning("Lazy explanation backfill DB update failed for quiz %s: %s", quiz_id, exc)
        await db.rollback()
    finally:
        await db.close()
