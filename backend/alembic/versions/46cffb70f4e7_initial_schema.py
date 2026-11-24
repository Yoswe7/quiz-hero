"""initial_schema

Revision ID: 46cffb70f4e7
Revises: 
Create Date: 2026-09-06 11:48:38.452975

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel

# revision identifiers, used by Alembic.
revision: str = '46cffb70f4e7'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("google_id", sa.String(), nullable=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("picture_url", sa.String(), nullable=True),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "quizzes",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("topic", sa.String(), nullable=False),
        sa.Column("quiz_type", sa.String(), nullable=False),
        sa.Column("question_count", sa.Integer(), nullable=False),
        sa.Column("created_by_email", sa.String(), sa.ForeignKey("users.email"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "questions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("quiz_id", sa.String(), sa.ForeignKey("quizzes.id"), nullable=False),
        sa.Column("question_text", sa.String(), nullable=False),
        sa.Column("quiz_type", sa.String(), nullable=False),
        sa.Column("section_name", sa.String(), nullable=True),
        sa.Column("answer", sa.String(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
    )

    op.create_table(
        "options",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("question_id", sa.Integer(), sa.ForeignKey("questions.id"), nullable=False),
        sa.Column("option_text", sa.String(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
    )

    op.create_table(
        "submissions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("student_name", sa.String(), nullable=False),
        sa.Column("student_email", sa.String(), nullable=False),
        sa.Column("quiz_id", sa.String(), sa.ForeignKey("quizzes.id"), nullable=False),
        sa.Column("topic", sa.String(), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("total_questions", sa.Integer(), nullable=False),
        sa.Column("percentage", sa.Float(), nullable=False),
        sa.Column("answers", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("submissions")
    op.drop_table("options")
    op.drop_table("questions")
    op.drop_table("quizzes")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")