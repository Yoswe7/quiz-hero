"""add faculty verification fields to submissions

Revision ID: add_faculty_verification_fields
Revises: e0f1a2b3c4d5
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlmodel import SQLModel

revision: str = "add_faculty_verification_fields"
down_revision: Union[str, Sequence[str], None] = "e0f1a2b3c4d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("submissions", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("raw_score", sa.Float(), nullable=True)
        )
        batch_op.add_column(
            sa.Column("adjusted_score", sa.Float(), nullable=True)
        )
        batch_op.add_column(
            sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.false())
        )
        batch_op.add_column(
            sa.Column("faculty_remarks", sa.Text(), nullable=True)
        )
        batch_op.add_column(
            sa.Column("reviewed_by", sa.Integer(), nullable=True)
        )
        batch_op.add_column(
            sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.create_foreign_key(
            "fk_submissions_reviewed_by_users_email",
            "users",
            ["reviewed_by"],
            ["email"],
        )


def downgrade() -> None:
    with op.batch_alter_table("submissions", schema=None) as batch_op:
        batch_op.drop_constraint("fk_submissions_reviewed_by_users_email", type_="foreignkey")
        batch_op.drop_column("reviewed_at")
        batch_op.drop_column("reviewed_by")
        batch_op.drop_column("faculty_remarks")
        batch_op.drop_column("is_verified")
        batch_op.drop_column("adjusted_score")
        batch_op.drop_column("raw_score")