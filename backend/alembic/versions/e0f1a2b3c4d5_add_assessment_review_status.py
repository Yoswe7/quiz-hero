"""add assessment review status

Revision ID: e0f1a2b3c4d5
Revises: d9e0f1a2b3c4
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e0f1a2b3c4d5"
down_revision: Union[str, Sequence[str], None] = "d9e0f1a2b3c4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("quizzes") as batch_op:
        batch_op.add_column(
            sa.Column("review_status", sa.String(), nullable=False, server_default="published")
        )
        batch_op.create_index("ix_quizzes_review_status", ["review_status"])


def downgrade() -> None:
    with op.batch_alter_table("quizzes") as batch_op:
        batch_op.drop_index("ix_quizzes_review_status")
        batch_op.drop_column("review_status")
