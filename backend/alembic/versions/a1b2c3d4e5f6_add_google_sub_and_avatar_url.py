"""add_google_sub_and_avatar_url

Revision ID: a1b2c3d4e5f6
Revises: 46cffb70f4e7
Create Date: 2026-10-30 14:20:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '46cffb70f4e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('google_sub', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('name', sa.String(), server_default='', nullable=False))
        batch_op.add_column(sa.Column('avatar_url', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.create_index('ix_users_google_sub', ['google_sub'], unique=True)

def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_index('ix_users_google_sub')
        batch_op.drop_column('updated_at')
        batch_op.drop_column('avatar_url')
        batch_op.drop_column('name')
        batch_op.drop_column('google_sub')

