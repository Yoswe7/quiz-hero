import hashlib
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import delete, select

from app.api.dependencies import (
    async_session_maker,
    get_db_session,
    require_teacher,
)
from app.models import CourseMaterial, MaterialQuestionPool, User
from app.services.ai_generator import generate_quiz
from app.services.llm_router import _extract_docx_text, _extract_pdf_text
from app.services.quiz_service import append_questions_to_pool, get_pool_warm_semaphore

router = APIRouter()
SessionLocal = async_session_maker
STARTER_POOL_SPEC: tuple[tuple[str, int], ...] = (
    ("Multiple Choice", 10),
    ("Identification", 10),
    ("True or False", 5),
    ("Open Ended", 5),
)


class PrepareMaterialRequest(BaseModel):
    filename: str
    file_base64: str
    file_mime_type: Optional[str] = None


def _decode_base64(value: str) -> bytes:
    encoded = value
    if value.startswith("data:"):
        _, separator, encoded = value.partition(",")
        if not separator:
            raise ValueError("Invalid data URL.")
    import base64 as _b64
    import binascii

    try:
        return _b64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Invalid base64 payload.") from exc


def _extract_text(raw_bytes: bytes, mime_type: Optional[str], filename: str) -> str:
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


async def _run_pregeneration(material_id: int, extracted_text: str) -> None:
    """Sequentially warm MaterialQuestionPool (Semaphore(1)) using Token Diet,
    then update CourseMaterial status in a fresh short-lived DB session.
    """
    collected: list[dict] = []
    try:
        async with get_pool_warm_semaphore():
            for qtype, qcount in STARTER_POOL_SPEC:
                questions, _ = await generate_quiz(
                    topic="Prepared Material",
                    question_count=qcount,
                    quiz_type=qtype,
                    source_type="text",
                    content_text=extracted_text,
                    generation_mode="fast",
                )
                collected.extend(questions)
                await append_questions_to_pool(material_id, questions)

        session = SessionLocal()
        try:
            material = await session.get(CourseMaterial, material_id)
            if material is None:
                return
            material.pregenerated_questions_json = collected
            material.status = "ready"
            material.error_message = None
            await session.commit()
        finally:
            await session.close()
    except Exception as exc:  # noqa: BLE001
        session = SessionLocal()
        try:
            material = await session.get(CourseMaterial, material_id)
            if material is None:
                return
            if collected:
                material.pregenerated_questions_json = collected
            material.status = "failed"
            material.error_message = str(exc)
            await session.commit()
        finally:
            await session.close()


@router.post("/materials/prepare")
async def prepare_material(
    request: PrepareMaterialRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_teacher),
):
    try:
        raw_bytes = _decode_base64(request.file_base64)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    file_hash = hashlib.sha256(raw_bytes).hexdigest()

    result = await db.execute(
        select(CourseMaterial).where(
            CourseMaterial.created_by_email == current_user.email,
            CourseMaterial.file_hash == file_hash,
        )
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        return existing

    extracted_text = _extract_text(raw_bytes, request.file_mime_type, request.filename)
    if not (extracted_text or "").strip():
        raise HTTPException(
            status_code=400,
            detail="No readable text could be extracted from this file.",
        )
    content_hash = hashlib.sha256(_normalize_text(extracted_text).encode("utf-8")).hexdigest()

    material = CourseMaterial(
        filename=request.filename,
        created_by_email=current_user.email,
        file_hash=file_hash,
        content_hash=content_hash,
        extracted_text=extracted_text,
        status="processing",
    )
    db.add(material)
    await db.commit()
    await db.refresh(material)

    background_tasks.add_task(_run_pregeneration, material.id, extracted_text)
    return material


@router.post("/materials/{material_id}/retry")
async def retry_material(
    material_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_teacher),
):
    result = await db.execute(
        select(CourseMaterial).where(
            CourseMaterial.id == material_id,
            CourseMaterial.created_by_email == current_user.email,
        )
    )
    material = result.scalar_one_or_none()
    if material is None:
        raise HTTPException(status_code=404, detail="Material not found.")

    material.status = "processing"
    material.error_message = None
    await db.commit()
    await db.refresh(material)

    background_tasks.add_task(_run_pregeneration, material.id, material.extracted_text or "")
    return material


@router.get("/materials")
async def list_materials(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_teacher),
):
    result = await db.execute(
        select(CourseMaterial)
        .where(CourseMaterial.created_by_email == current_user.email)
        .order_by(CourseMaterial.created_at.desc())
    )
    materials = result.scalars().all()
    material_ids = [m.id for m in materials if m.id is not None]
    pool_counts: dict[int, int] = {}
    if material_ids:
        count_result = await db.execute(
            select(MaterialQuestionPool.material_id, func.count(MaterialQuestionPool.id))
            .where(MaterialQuestionPool.material_id.in_(material_ids))
            .group_by(MaterialQuestionPool.material_id)
        )
        pool_counts = {mid: int(cnt) for mid, cnt in count_result.all()}

    payload = []
    for material in materials:
        legacy_pool = material.pregenerated_questions_json
        legacy_count = len(legacy_pool) if isinstance(legacy_pool, list) else 0
        payload.append(
            {
                "id": material.id,
                "filename": material.filename,
                "file_hash": material.file_hash,
                "status": material.status,
                "question_pool_count": pool_counts.get(material.id, 0) or legacy_count,
                "error_message": material.error_message,
                "created_at": material.created_at,
            }
        )
    return {"materials": payload}


@router.delete("/materials/{material_id}")
async def delete_material(
    material_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_teacher),
):
    result = await db.execute(
        select(CourseMaterial).where(
            CourseMaterial.id == material_id,
            CourseMaterial.created_by_email == current_user.email,
        )
    )
    material = result.scalar_one_or_none()
    if material is None:
        raise HTTPException(status_code=404, detail="Material not found.")

    await db.execute(
        delete(MaterialQuestionPool).where(MaterialQuestionPool.material_id == material_id)
    )
    await db.delete(material)
    await db.commit()
    return {"message": "Material deleted successfully", "material_id": material_id}