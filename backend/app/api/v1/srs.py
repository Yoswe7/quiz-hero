from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.api.dependencies import get_db_session, require_student
from app.core.rate_limit import ai_concurrency_limit, rate_limit
from app.crud.crud_quiz import get_student_class_ids, quiz_is_assigned_to_student
from app.models import (
    CourseMaterial,
    LessonFlashcard,
    Question,
    Quiz,
    ReviewItem,
    Submission,
    User,
)
from app.schemas.srs import (
    LessonGenerateRequest,
    LessonParseRequest,
    LessonParseResponse,
    LessonSectionOut,
    ReviewItemCreate,
    ReviewItemOut,
    ReviewRequest,
    SharedLessonOut,
)
from app.services.lesson_flashcards import (
    decode_and_extract_lesson_text,
    generate_flashcards_from_sections,
    split_lesson_into_sections,
)
from app.services.llm_router import LLMRouterError
from app.services.srs_services import (
    apply_sm2,
    create_or_get_item,
    get_all_items,
    get_due_items,
    get_item,
)

router = APIRouter(prefix="/srs")


def _parse_question_item_key(item_key: str) -> tuple[str, int] | None:
    """Parse 'quiz:<quiz_id>:question:<question_id>' keys safely."""
    parts = item_key.split(":")
    if len(parts) != 4 or parts[0] != "quiz" or parts[2] != "question":
        return None
    try:
        return parts[1], int(parts[3])
    except ValueError:
        return None


def _parse_lesson_item_key(item_key: str) -> UUID | None:
    """Parse 'lesson:<uuid>' keys safely."""
    if not item_key.startswith("lesson:"):
        return None
    try:
        return UUID(item_key.split(":", 1)[1])
    except ValueError:
        return None


def _extract_submission_explanation(submission: Submission, question_text: str) -> str | None:
    """Find feedback/explanation for a question from a student's submission."""
    target = question_text.strip().lower()
    for entry in submission.answers or []:
        if not isinstance(entry, dict):
            continue
        if (entry.get("question") or "").strip().lower() == target:
            explanation = entry.get("explanation") or entry.get("ai_feedback")
            if isinstance(explanation, str) and explanation.strip():
                return explanation.strip()
    return None


async def _build_responses(
    db: AsyncSession,
    items: list[ReviewItem],
    student_email: str,
) -> list[ReviewItemOut]:
    if not items:
        return []

    normalized_email = student_email.strip().lower()
    class_ids = await get_student_class_ids(db, normalized_email)

    sub_result = await db.execute(
        select(Submission)
        .where(func.lower(Submission.student_email) == normalized_email)
        .order_by(Submission.created_at.desc())
    )
    latest_submissions: dict[str, Submission] = {}
    for sub in sub_result.scalars().all():
        latest_submissions.setdefault(sub.quiz_id, sub)

    quiz_cache: dict[str, Quiz | None] = {}
    responses: list[ReviewItemOut] = []

    for item in items:
        prompt: str | None = None
        topic: str | None = None
        correct_answer: str | None = None
        explanation: str | None = None

        lesson_id = _parse_lesson_item_key(item.item_key)
        if lesson_id is not None:
            flashcard = await db.get(LessonFlashcard, lesson_id)
            if flashcard is not None and flashcard.user_email.strip().lower() == normalized_email:
                prompt = flashcard.prompt
                topic = flashcard.topic
                correct_answer = flashcard.correct_answer
                explanation = flashcard.explanation
        else:
            parsed = _parse_question_item_key(item.item_key)
            if parsed is not None:
                key_quiz_id, question_id = parsed
                question = await db.get(Question, question_id)
                if question is not None and question.quiz_id == key_quiz_id:
                    if question.quiz_id not in quiz_cache:
                        quiz_cache[question.quiz_id] = await db.get(Quiz, question.quiz_id)
                    quiz = quiz_cache[question.quiz_id]
                    submission = latest_submissions.get(question.quiz_id)
                    is_assigned = bool(
                        quiz is not None
                        and (
                            quiz_is_assigned_to_student(quiz, normalized_email)
                            or (quiz.classroom_id is not None and quiz.classroom_id in class_ids)
                        )
                    )
                    if (
                        quiz is not None
                        and quiz.review_status == "published"
                        and is_assigned
                        and submission is not None
                    ):
                        prompt = question.question_text
                        topic = quiz.topic
                        correct_answer = question.answer
                        explanation = getattr(question, "explanation", None) or _extract_submission_explanation(
                            submission, question.question_text
                        )

        responses.append(
            ReviewItemOut(
                id=item.id,
                item_key=item.item_key,
                prompt=prompt,
                topic=topic,
                correct_answer=correct_answer,
                explanation=explanation,
                repetitions=item.repetitions,
                interval_days=item.interval_days,
                easiness=item.easiness,
                last_reviewed_at=item.last_reviewed_at,
                next_review_at=item.next_review_at,
            )
        )

    return responses


@router.get("/due", response_model=list[ReviewItemOut])
async def list_due_reviews(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_student),
    limit: int = Query(default=50, ge=1, le=100),
    include_all: bool = Query(default=False),
):
    items = (
        await get_all_items(db, current_user.email, limit)
        if include_all
        else await get_due_items(db, current_user.email, limit)
    )
    return await _build_responses(db, items, current_user.email)


@router.get("/items", response_model=list[ReviewItemOut])
async def list_all_review_items(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_student),
    limit: int = Query(default=100, ge=1, le=500),
):
    items = await get_all_items(db, current_user.email, limit)
    return await _build_responses(db, items, current_user.email)


@router.post("/items", response_model=ReviewItemOut)
async def create_review_item(
    request: ReviewItemCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_student),
):
    item = await create_or_get_item(db, current_user.email, request.item_key.strip())
    return (await _build_responses(db, [item], current_user.email))[0]


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
    updated = await apply_sm2(item, request.quality, db)
    return (await _build_responses(db, [updated], current_user.email))[0]


@router.get("/lessons/shared", response_model=list[SharedLessonOut])
async def list_shared_lessons(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_student),
):
    result = await db.execute(
        select(CourseMaterial)
        .where(CourseMaterial.status == "ready")
        .order_by(CourseMaterial.created_at.desc())
    )
    materials = result.scalars().all()
    return [
        SharedLessonOut(
            id=m.id,
            filename=m.filename,
            created_by_email=m.created_by_email,
            created_at=m.created_at,
            char_count=len(m.extracted_text or ""),
        )
        for m in materials
        if m.id is not None and (m.extracted_text or "").strip()
    ]


@router.post("/lessons/parse", response_model=LessonParseResponse)
async def parse_lesson_sections(
    request: LessonParseRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_student),
):
    source_name = (request.filename or "Pasted Lesson").strip()
    raw_text = ""

    if request.source_type == "text":
        raw_text = (request.text or "").strip()
        if not raw_text:
            raise HTTPException(status_code=400, detail="Please paste lesson text to analyze.")
    elif request.source_type == "file":
        if not request.file_base64 or not request.filename:
            raise HTTPException(status_code=400, detail="Please upload a lesson file.")
        try:
            raw_text = decode_and_extract_lesson_text(
                request.file_base64, request.filename, request.file_mime_type
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    elif request.source_type == "material":
        if request.material_id is None:
            raise HTTPException(status_code=400, detail="Please choose a course material.")
        material = await db.get(CourseMaterial, request.material_id)
        if material is None or material.status != "ready" or not (material.extracted_text or "").strip():
            raise HTTPException(status_code=404, detail="Course material not found or not ready.")
        source_name = material.filename
        raw_text = material.extracted_text

    sections = split_lesson_into_sections(raw_text)
    if not sections:
        raise HTTPException(status_code=400, detail="No readable sections were found in this lesson.")

    return LessonParseResponse(
        source_name=source_name,
        sections=[LessonSectionOut(**sec) for sec in sections],
    )


@router.post("/lessons/generate", response_model=list[ReviewItemOut])
async def generate_lesson_flashcards(
    request: LessonGenerateRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_student),
    _rate_limit: None = Depends(rate_limit(10, 60, authenticated=True)),
    _ai_limit: None = Depends(ai_concurrency_limit(authenticated=True)),
):
    try:
        generated_cards = await generate_flashcards_from_sections(
            topic=request.topic,
            sections=[s.model_dump() for s in request.selected_sections],
            card_count=request.card_count,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except LLMRouterError as exc:
        raise HTTPException(status_code=503, detail=f"AI flashcard generation unavailable: {exc}")

    created_review_items: list[ReviewItem] = []
    for card_data in generated_cards:
        lesson_card = LessonFlashcard(
            user_email=current_user.email,
            topic=request.topic.strip(),
            source_name=request.source_name,
            section_title=card_data.get("section_title"),
            prompt=card_data["prompt"],
            correct_answer=card_data["correct_answer"],
            explanation=card_data.get("explanation"),
        )
        db.add(lesson_card)
        await db.flush()

        review_item_row = ReviewItem(
            user_email=current_user.email,
            item_key=f"lesson:{lesson_card.id}",
        )
        db.add(review_item_row)
        created_review_items.append(review_item_row)

    await db.commit()
    for row in created_review_items:
        await db.refresh(row)

    return await _build_responses(db, created_review_items, current_user.email)
