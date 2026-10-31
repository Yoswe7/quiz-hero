import secrets
from datetime import timedelta
from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.auth import GoogleAuthRequest, UserResponse
from app.api.dependencies import get_db_session, get_current_user
from app.crud.crud_user import (
    get_admin_emails,
    get_teacher_emails,
    get_user_by_email,
    get_user_by_google_sub,
    create_user,
)
from app.models.user import UserRole
from app.core.security import verify_google_oauth_token, create_access_token
from app.core.config import settings

router = APIRouter()
CVSU_DOMAIN = "@cvsu.edu.ph"
CVSU_HD = "cvsu.edu.ph"

@router.post("/auth/google", response_model=UserResponse)
@router.post("/api/auth/google", response_model=UserResponse)
async def authenticate_google(
    request: GoogleAuthRequest, 
    db: AsyncSession = Depends(get_db_session)
):
    if not request.credential or not request.credential.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing Google OAuth credential token."
        )

    # 1. Cryptographic token verification with Google's servers & audience check
    id_info = verify_google_oauth_token(request.credential.strip())

    # 2. Strict Domain & Institutional Checks
    email_verified = id_info.get("email_verified") is True
    hosted_domain = id_info.get("hd")
    email = (id_info.get("email") or "").strip().lower()

    admin_emails = get_admin_emails()
    teacher_emails = get_teacher_emails()
    is_admin = email in admin_emails

    if not email_verified or (not is_admin and (hosted_domain != CVSU_HD or not email.endswith(CVSU_DOMAIN))):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only verified @cvsu.edu.ph Google Workspace accounts are allowed."
        )

    name = (id_info.get("name") or "").strip() or email.split("@")[0].replace(".", " ").title()
    avatar_url = id_info.get("picture") or None
    google_sub = id_info.get("sub") or None

    # 3. Database Lookup Priority: google_sub -> email
    user = None
    if google_sub:
        user = await get_user_by_google_sub(db, google_sub)
    if not user:
        user = await get_user_by_email(db, email)

    # 4. Branch A: Sign In (Returning User)
    if request.auth_mode == "signin":
        if not user:
            # Master/Admin Auto-provision Bypass
            if is_admin or email in teacher_emails:
                user = await create_user(
                    db=db,
                    email=email,
                    name=name,
                    avatar_url=avatar_url,
                    google_sub=google_sub,
                    role=UserRole.TEACHER.value,
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="No account found for this email. Please switch to Create Account to register.",
                )
        else:
            # User exists: preserve existing role unless admin/whitelisted teacher
            if is_admin or email in teacher_emails:
                user.role = UserRole.TEACHER.value

            # Sync profile metadata
            if name and user.name != name:
                user.name = name
                user.full_name = name
            if avatar_url and user.avatar_url != avatar_url:
                user.avatar_url = avatar_url
                user.picture_url = avatar_url
            if google_sub and user.google_sub != google_sub:
                user.google_sub = google_sub
                user.google_id = google_sub

            await db.commit()
            await db.refresh(user)

    # 5. Branch B: Sign Up (Registration & Role Onboarding)
    else:
        # Determine Target Role
        if is_admin or email in teacher_emails:
            target_role = UserRole.TEACHER.value
        elif request.requested_role == "TEACHER":
            valid_code = (settings.FACULTY_ACCESS_CODE or "CVSU_FACULTY_2026").strip()
            provided_code = (request.faculty_code or "").strip()
            if not secrets.compare_digest(provided_code, valid_code):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Invalid Faculty Verification Code.",
                )
            target_role = UserRole.TEACHER.value
        else:
            target_role = UserRole.STUDENT.value

        if user:
            # Safe upsert & prevent role downgrades
            if user.role.upper() == UserRole.STUDENT.value and target_role == UserRole.TEACHER.value:
                user.role = UserRole.TEACHER.value
            elif user.role.upper() == UserRole.TEACHER.value and target_role == UserRole.STUDENT.value:
                # NEVER downgrade an existing teacher who accidentally signs up as student
                user.role = UserRole.TEACHER.value
            else:
                user.role = target_role

            if name and user.name != name:
                user.name = name
                user.full_name = name
            if avatar_url and user.avatar_url != avatar_url:
                user.avatar_url = avatar_url
                user.picture_url = avatar_url
            if google_sub and user.google_sub != google_sub:
                user.google_sub = google_sub
                user.google_id = google_sub

            await db.commit()
            await db.refresh(user)
        else:
            user = await create_user(
                db=db,
                email=email,
                name=name,
                avatar_url=avatar_url,
                google_sub=google_sub,
                role=target_role,
            )

    # 6. Issue Application JWT Session
    access_token_expires = timedelta(days=7)
    access_token = create_access_token(
        data={
            "user_id": user.id,
            "email": user.email,
            "role": user.role,
            "sub": user.email,
        },
        expires_delta=access_token_expires,
    )

    return UserResponse(
        id=user.id,
        google_sub=user.google_sub,
        email=user.email,
        name=user.name,
        full_name=user.name,
        avatar_url=user.avatar_url,
        picture_url=user.avatar_url,
        role=user.role,
        token=access_token,
    )

@router.get("/auth/me", response_model=UserResponse)
@router.get("/api/auth/me", response_model=UserResponse)
async def get_current_user_profile(current_user = Depends(get_current_user)):
    return UserResponse(
        id=current_user.id,
        google_sub=current_user.google_sub,
        email=current_user.email,
        name=current_user.name,
        full_name=current_user.name,
        avatar_url=current_user.avatar_url,
        picture_url=current_user.avatar_url,
        role=current_user.role,
    )
