"""add material_question_pool table

Revision ID: h5f6a7b8c9d0
Revises: g4e5f6a7b8c9
Create Date: 2026-11-27 21:58:30.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'h5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'g4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("material_question_pool"):
        op.create_table(
            "material_question_pool",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("material_id", sa.Integer(), sa.ForeignKey("course_materials.id"), nullable=False),
            sa.Column("question_type", sa.String(), nullable=False),
            sa.Column("question_json", sa.JSON(), nullable=False),
            sa.Column("fingerprint", sa.String(), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.UniqueConstraint("material_id", "fingerprint", name="uq_material_pool_fingerprint"),
        )
        op.create_index("ix_material_question_pool_material_id", "material_question_pool", ["material_id"])
        op.create_index("ix_material_question_pool_question_type", "material_question_pool", ["question_type"])
        op.create_index("ix_material_question_pool_fingerprint", "material_question_pool", ["fingerprint"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("material_question_pool"):
        op.drop_table("material_question_pool")
