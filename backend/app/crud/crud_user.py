from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from app.models.user import User, UserRole
from app.core.config import settings

def get_admin_emails() -> set[str]:
    raw = settings.ADMIN_EMAILS or ""
    return {email.strip().lower() for email in raw.split(",") if email.strip()}

def get_teacher_emails() -> set[str]:
    raw = settings.TEACHER_EMAILS or ""
    return {email.strip().lower() for email in raw.split(",") if email.strip()}

async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email.strip().lower()))
    return result.scalar_one_or_none()

async def get_user_by_google_sub(db: AsyncSession, google_sub: str) -> User | None:
    result = await db.execute(select(User).where(User.google_sub == google_sub))
    return result.scalar_one_or_none()

async def create_user(
    db: AsyncSession,
    email: str,
    name: str,
    avatar_url: str | None = None,
    google_sub: str | None = None,
    role: str = UserRole.STUDENT.value
) -> User:
    clean_email = email.strip().lower()
    user = User(
        email=clean_email,
        name=name or clean_email.split("@")[0],
        full_name=name or clean_email.split("@")[0],
        avatar_url=avatar_url,
        picture_url=avatar_url,
        google_sub=google_sub,
        google_id=google_sub,
        role=role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user

async def upsert_user(
    db: AsyncSession,
    email: str,
    name: str,
    avatar_url: str | None = None,
    google_sub: str | None = None,
    role: str | None = None
) -> User:
    clean_email = email.strip().lower()
    admin_emails = get_admin_emails()
    teacher_emails = get_teacher_emails()

    user = None
    if google_sub:
        user = await get_user_by_google_sub(db, google_sub)
    if not user:
        user = await get_user_by_email(db, clean_email)

    if clean_email in admin_emails or clean_email in teacher_emails:
        effective_role = UserRole.TEACHER.value
    elif role:
        effective_role = UserRole.TEACHER.value if role.upper() == UserRole.TEACHER.value else UserRole.STUDENT.value
    elif user and user.role:
        effective_role = user.role
    else:
        effective_role = UserRole.STUDENT.value

    if user:
        if name:
            user.name = name
            user.full_name = name
        if avatar_url:
            user.avatar_url = avatar_url
            user.picture_url = avatar_url
        if google_sub:
            user.google_sub = google_sub
            user.google_id = google_sub
        user.role = effective_role
    else:
        user = User(
            email=clean_email,
            name=name or clean_email.split("@")[0],
            full_name=name or clean_email.split("@")[0],
            avatar_url=avatar_url,
            picture_url=avatar_url,
            google_sub=google_sub,
            google_id=google_sub,
            role=effective_role,
        )
        db.add(user)

    await db.commit()
    await db.refresh(user)
    return user
