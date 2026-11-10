from datetime import datetime
from sqlmodel import SQLModel, Field
from sqlalchemy import Column, DateTime, func


class Classroom(SQLModel, table=True):
    __tablename__ = "classrooms"

    id: str = Field(primary_key=True)
    name: str
    course_code: str | None = Field(default=None, index=True)
    class_section: str | None = Field(default=None, index=True)
    invite_code: str = Field(unique=True, index=True)
    created_by_email: str = Field(index=True, foreign_key="users.email")
    is_active: bool = True
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), server_default=func.now())
    )


class ClassroomMembership(SQLModel, table=True):
    __tablename__ = "classroom_memberships"

    id: int | None = Field(default=None, primary_key=True)
    classroom_id: str = Field(foreign_key="classrooms.id", index=True)
    student_email: str = Field(index=True)
    joined_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), server_default=func.now())
    )
