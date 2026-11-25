"""replace overall time limit with per-question seconds

Revision ID: f3d21a90c7e8
Revises: ceab1280be4a
Create Date: 2026-11-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'f3d21a90c7e8'
down_revision: Union[str, Sequence[str], None] = 'ceab1280be4a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: add question_time_limit_seconds, drop time_limit_minutes."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("quizzes"):
        cols = {c["name"] for c in inspector.get_columns("quizzes")}
        if "question_time_limit_seconds" not in cols:
            op.add_column(
                "quizzes",
                sa.Column("question_time_limit_seconds", sa.Integer(), nullable=True),
            )
        if "time_limit_minutes" in cols:
            with op.batch_alter_table("quizzes") as batch_op:
                batch_op.drop_column("time_limit_minutes")


def downgrade() -> None:
    """Downgrade schema: restore time_limit_minutes, drop question_time_limit_seconds."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("quizzes"):
        cols = {c["name"] for c in inspector.get_columns("quizzes")}
        if "time_limit_minutes" not in cols:
            op.add_column(
                "quizzes",
                sa.Column("time_limit_minutes", sa.Integer(), nullable=True),
            )
        if "question_time_limit_seconds" in cols:
            with op.batch_alter_table("quizzes") as batch_op:
                batch_op.drop_column("question_time_limit_seconds")
