"""add review items

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f6
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b7c8d9e0f1a2"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "review_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_email", sa.String(), nullable=False),
        sa.Column("item_key", sa.String(), nullable=False),
        sa.Column("repetitions", sa.Integer(), nullable=False),
        sa.Column("interval_days", sa.Integer(), nullable=False),
        sa.Column("easiness", sa.Float(), nullable=False),
        sa.Column("last_reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_review_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("quality_history", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_review_items_user_email", "review_items", ["user_email"])
    op.create_index("ix_review_items_item_key", "review_items", ["item_key"])


def downgrade() -> None:
    op.drop_index("ix_review_items_item_key", table_name="review_items")
    op.drop_index("ix_review_items_user_email", table_name="review_items")
    op.drop_table("review_items")
