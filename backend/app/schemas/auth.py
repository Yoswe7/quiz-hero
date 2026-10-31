from typing import Literal
from pydantic import BaseModel, Field, model_validator

class GoogleAuthRequest(BaseModel):
    credential: str = Field(..., description="Google OAuth 2.0 ID Token")
    auth_mode: Literal["signin", "signup"] = Field(
        default="signin",
        description="Authentication mode: signin for existing users, signup for registration"
    )
    requested_role: Literal["STUDENT", "TEACHER"] = Field(
        default="STUDENT",
        description="Requested role during signup: STUDENT or TEACHER"
    )
    faculty_code: str | None = Field(
        default=None,
        description="Faculty verification code required when requested_role is TEACHER"
    )

    @model_validator(mode="after")
    def validate_faculty_signup(self) -> "GoogleAuthRequest":
        if self.auth_mode == "signup" and self.requested_role == "TEACHER":
            if not self.faculty_code or not self.faculty_code.strip():
                raise ValueError("Faculty verification code is required for Faculty registration.")
        return self

class UserResponse(BaseModel):
    id: int | None = None
    google_sub: str | None = None
    email: str
    name: str = ""
    full_name: str = ""
    avatar_url: str | None = None
    picture_url: str | None = None
    role: str
    token: str | None = None
