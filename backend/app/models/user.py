from datetime import datetime
from enum import Enum
from sqlalchemy import Column, DateTime, func
from sqlmodel import SQLModel, Field

class UserRole(str, Enum):
    STUDENT = "STUDENT"
    TEACHER = "TEACHER"

class User(SQLModel, table=True):
    __tablename__ = "users"

    id: int | None = Field(default=None, primary_key=True)
    google_sub: str | None = Field(default=None, unique=True, index=True)
    google_id: str | None = Field(default=None, index=True)  # Legacy compatibility column
    email: str = Field(unique=True, index=True)
    name: str = Field(default="")
    full_name: str | None = Field(default=None)  # Legacy compatibility column
    avatar_url: str | None = Field(default=None)
    picture_url: str | None = Field(default=None)  # Legacy compatibility column
    role: str = Field(default=UserRole.STUDENT.value)
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    )
    updated_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    )

    @property
    def display_name(self) -> str:
        return self.name or self.full_name or self.email.split("@")[0]

    @property
    def display_avatar(self) -> str | None:
        return self.avatar_url or self.picture_url
