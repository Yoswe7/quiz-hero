"""add allow_retakes field to quizzes

Revision ID: 285dff9768ff
Revises: add_faculty_verification_fields
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "285dff9768ff"
down_revision: Union[str, Sequence[str], None] = "add_faculty_verification_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("quizzes", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("allow_retakes", sa.Boolean(), nullable=False, server_default=sa.false())
        )


def downgrade() -> None:
    with op.batch_alter_table("quizzes", schema=None) as batch_op:
        batch_op.drop_column("allow_retakes")