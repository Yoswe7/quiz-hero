"""add quiz assignment metadata

Revision ID: c8d9e0f1a2b3
Revises: b7c8d9e0f1a2
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c8d9e0f1a2b3"
down_revision: Union[str, Sequence[str], None] = "b7c8d9e0f1a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("quizzes", schema=None) as batch_op:
        batch_op.add_column(sa.Column("course_code", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("class_section", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("due_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(
            sa.Column("assigned_student_emails", sa.JSON(), nullable=False, server_default="[]")
        )
        batch_op.add_column(
            sa.Column("is_assigned", sa.Boolean(), nullable=False, server_default=sa.false())
        )
        batch_op.create_index("ix_quizzes_course_code", ["course_code"], unique=False)
        batch_op.create_index("ix_quizzes_class_section", ["class_section"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("quizzes", schema=None) as batch_op:
        batch_op.drop_index("ix_quizzes_class_section")
        batch_op.drop_index("ix_quizzes_course_code")
        batch_op.drop_column("is_assigned")
        batch_op.drop_column("assigned_student_emails")
        batch_op.drop_column("due_at")
        batch_op.drop_column("class_section")
        batch_op.drop_column("course_code")
