"""add max_attempts field to quizzes

Revision ID: e50e74558440
Revises: 4f4a561bc677
Create Date: 2026-11-24 17:26:47.925478

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'e50e74558440'
down_revision: Union[str, Sequence[str], None] = '4f4a561bc677'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("quizzes", schema=None) as batch_op:
        batch_op.add_column(sa.Column("max_attempts", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("quizzes", schema=None) as batch_op:
        batch_op.drop_column("max_attempts")
