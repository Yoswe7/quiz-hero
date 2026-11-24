from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from app.models import Submission


async def create_submission(db: AsyncSession, submission: Submission) -> Submission:
    db.add(submission)
    await db.commit()
    await db.refresh(submission)
    return submission

async def get_submissions_by_role(db: AsyncSession, role: str, student_email: str | None = None) -> list[Submission]:
    if role == "teacher":
        result = await db.execute(select(Submission).order_by(Submission.created_at.desc()))
        return result.scalars().all()
    else:
        result = await db.execute(select(Submission).where(Submission.student_email == student_email).order_by(Submission.created_at.desc()))
        return result.scalars().all()

async def delete_submission(db: AsyncSession, submission_id: int) -> bool:
    result = await db.execute(select(Submission).where(Submission.id == submission_id))
    submission = result.scalar_one_or_none()
    if not submission:
        return False
    await db.delete(submission)
    await db.commit()
    return True


async def get_submission_by_id(db: AsyncSession, submission_id: int) -> Submission | None:
    result = await db.execute(select(Submission).where(Submission.id == submission_id))
    return result.scalar_one_or_none()
