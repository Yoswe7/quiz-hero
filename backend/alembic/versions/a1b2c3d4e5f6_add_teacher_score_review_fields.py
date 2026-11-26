"""add teacher score review fields

Revision ID: a1b2c3d4e5f6
Revises: f3d21a90c7e8
Create Date: 2026-11-26 00:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a1b2c3d4e5f6"
down_revision = "f3d21a90c7e8"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("submissions", sa.Column("ai_score", sa.Float(), nullable=False, server_default="0"))
    op.add_column("submissions", sa.Column("grading_status", sa.String(), nullable=False, server_default="ai_graded"))
    op.add_column("submissions", sa.Column("score_overrides", sa.JSON(), nullable=True))


def downgrade():
    op.drop_column("submissions", "score_overrides")
    op.drop_column("submissions", "grading_status")
    op.drop_column("submissions", "ai_score")