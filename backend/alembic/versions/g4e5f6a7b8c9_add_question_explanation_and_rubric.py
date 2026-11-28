"""add explanation and grading_rubric to questions

Revision ID: g4e5f6a7b8c9
Revises: f3d21a90c7e8
Create Date: 2026-11-27 21:42:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'g4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'f3d21a90c7e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("questions"):
        cols = {c["name"] for c in inspector.get_columns("questions")}
        if "explanation" not in cols:
            op.add_column("questions", sa.Column("explanation", sa.Text(), nullable=True))
        if "grading_rubric" not in cols:
            op.add_column("questions", sa.Column("grading_rubric", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("questions"):
        cols = {c["name"] for c in inspector.get_columns("questions")}
        with op.batch_alter_table("questions") as batch_op:
            if "grading_rubric" in cols:
                batch_op.drop_column("grading_rubric")
            if "explanation" in cols:
                batch_op.drop_column("explanation")
