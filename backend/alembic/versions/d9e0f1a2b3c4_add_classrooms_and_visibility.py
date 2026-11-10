"""add classrooms and assessment visibility windows

Revision ID: d9e0f1a2b3c4
Revises: c8d9e0f1a2b3
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "d9e0f1a2b3c4"
down_revision: Union[str, Sequence[str], None] = "c8d9e0f1a2b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("classrooms"):
        op.create_table(
            "classrooms",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("course_code", sa.String(), nullable=True),
            sa.Column("class_section", sa.String(), nullable=True),
            sa.Column("invite_code", sa.String(), nullable=False),
            sa.Column("created_by_email", sa.String(), sa.ForeignKey("users.email"), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    existing_indexes = {index["name"] for index in inspector.get_indexes("classrooms")}
    for name, columns, unique in (
        ("ix_classrooms_course_code", ["course_code"], False),
        ("ix_classrooms_class_section", ["class_section"], False),
        ("ix_classrooms_invite_code", ["invite_code"], True),
        ("ix_classrooms_created_by_email", ["created_by_email"], False),
    ):
        if name not in existing_indexes:
            op.create_index(name, "classrooms", columns, unique=unique)

    if not inspector.has_table("classroom_memberships"):
        op.create_table(
            "classroom_memberships",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("classroom_id", sa.String(), sa.ForeignKey("classrooms.id"), nullable=False),
            sa.Column("student_email", sa.String(), nullable=False),
            sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    membership_indexes = {index["name"] for index in inspector.get_indexes("classroom_memberships")}
    if "ix_classroom_memberships_classroom_id" not in membership_indexes:
        op.create_index("ix_classroom_memberships_classroom_id", "classroom_memberships", ["classroom_id"])
    if "ix_classroom_memberships_student_email" not in membership_indexes:
        op.create_index("ix_classroom_memberships_student_email", "classroom_memberships", ["student_email"])

    with op.batch_alter_table("quizzes") as batch_op:
        quiz_columns = {column["name"] for column in sa.inspect(bind).get_columns("quizzes")}
        if "classroom_id" not in quiz_columns:
            batch_op.add_column(
                sa.Column(
                    "classroom_id",
                    sa.String(),
                    sa.ForeignKey("classrooms.id", name="fk_quizzes_classroom_id"),
                    nullable=True,
                )
            )
        if "available_from" not in quiz_columns:
            batch_op.add_column(sa.Column("available_from", sa.DateTime(timezone=True), nullable=True))
        if "ix_quizzes_classroom_id" not in {index["name"] for index in sa.inspect(bind).get_indexes("quizzes")}:
            batch_op.create_index("ix_quizzes_classroom_id", ["classroom_id"])


def downgrade() -> None:
    with op.batch_alter_table("quizzes") as batch_op:
        batch_op.drop_index("ix_quizzes_classroom_id")
        batch_op.drop_column("available_from")
        batch_op.drop_column("classroom_id")
    op.drop_table("classroom_memberships")
    op.drop_index("ix_classrooms_created_by_email", table_name="classrooms")
    op.drop_index("ix_classrooms_invite_code", table_name="classrooms")
    op.drop_index("ix_classrooms_class_section", table_name="classrooms")
    op.drop_index("ix_classrooms_course_code", table_name="classrooms")
    op.drop_table("classrooms")
