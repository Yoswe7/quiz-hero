"""add timebound quiz taking fields

Revision ID: 4f4a561bc677
Revises: 285dff9768ff
Create Date: 2026-11-24 14:01:24.196942

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '4f4a561bc677'
down_revision: Union[str, Sequence[str], None] = '285dff9768ff'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("quizzes"):
        cols = {c["name"] for c in inspector.get_columns("quizzes")}
        if "time_limit_minutes" not in cols:
            op.add_column("quizzes", sa.Column("time_limit_minutes", sa.Integer(), nullable=True))
    if inspector.has_table("submissions"):
        cols = {c["name"] for c in inspector.get_columns("submissions")}
        if "started_at" not in cols:
            op.add_column("submissions", sa.Column("started_at", sa.DateTime(timezone=True), nullable=True))
        if "timed_out" not in cols:
            op.add_column("submissions", sa.Column("timed_out", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    if not inspector.has_table("quiz_sessions"):
        op.create_table(
            "quiz_sessions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("quiz_id", sa.String(), nullable=False),
            sa.Column("student_email", sa.String(), nullable=False),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("is_completed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.ForeignKeyConstraint(["quiz_id"], ["quizzes.id"]),
        )
        op.create_index("ix_quiz_sessions_quiz_id", "quiz_sessions", ["quiz_id"])
        op.create_index("ix_quiz_sessions_student_email", "quiz_sessions", ["student_email"])


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("quiz_sessions"):
        op.drop_index("ix_quiz_sessions_student_email", table_name="quiz_sessions")
        op.drop_index("ix_quiz_sessions_quiz_id", table_name="quiz_sessions")
        op.drop_table("quiz_sessions")
    if inspector.has_table("submissions"):
        with op.batch_alter_table("submissions") as batch_op:
            batch_op.drop_column("timed_out")
            batch_op.drop_column("started_at")
    if inspector.has_table("quizzes"):
        with op.batch_alter_table("quizzes") as batch_op:
            batch_op.drop_column("time_limit_minutes")
