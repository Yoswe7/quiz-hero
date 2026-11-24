"""add course materials

Revision ID: ceab1280be4a
Revises: e50e74558440
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision: str = 'ceab1280be4a'
down_revision: Union[str, Sequence[str], None] = 'e50e74558440'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Data fixes so NOT NULL alterations succeed on existing rows.
    op.execute("UPDATE submissions SET raw_score = 0 WHERE raw_score IS NULL")
    op.execute("UPDATE users SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP) WHERE updated_at IS NULL")

    op.create_table('course_materials',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('filename', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('created_by_email', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('file_hash', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('content_hash', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('extracted_text', sa.Text(), nullable=False),
    sa.Column('pregenerated_questions_json', sa.JSON(), nullable=True),
    sa.Column('status', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('error_message', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.ForeignKeyConstraint(['created_by_email'], ['users.email'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('course_materials', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_course_materials_content_hash'), ['content_hash'], unique=False)
        batch_op.create_index(batch_op.f('ix_course_materials_created_by_email'), ['created_by_email'], unique=False)
        batch_op.create_index(batch_op.f('ix_course_materials_file_hash'), ['file_hash'], unique=False)
        batch_op.create_index(batch_op.f('ix_course_materials_status'), ['status'], unique=False)

    with op.batch_alter_table('submissions', schema=None) as batch_op:
        batch_op.alter_column('raw_score',
               existing_type=sa.FLOAT(),
               nullable=False)
        batch_op.drop_constraint(batch_op.f('fk_submissions_reviewed_by_users_email'), type_='foreignkey')

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.alter_column('name',
               existing_type=sa.VARCHAR(),
               nullable=False)
        batch_op.alter_column('full_name',
               existing_type=sa.VARCHAR(),
               nullable=True)
        batch_op.alter_column('created_at',
               existing_type=sa.DATETIME(),
               nullable=False,
               existing_server_default=sa.text('(CURRENT_TIMESTAMP)'))
        batch_op.alter_column('updated_at',
               existing_type=sa.DATETIME(),
               nullable=False)


def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.alter_column('updated_at',
               existing_type=sa.DATETIME(),
               nullable=True)
        batch_op.alter_column('created_at',
               existing_type=sa.DATETIME(),
               nullable=True,
               existing_server_default=sa.text('(CURRENT_TIMESTAMP)'))
        batch_op.alter_column('full_name',
               existing_type=sa.VARCHAR(),
               nullable=False)
        batch_op.alter_column('name',
               existing_type=sa.VARCHAR(),
               nullable=True)

    with op.batch_alter_table('submissions', schema=None) as batch_op:
        batch_op.create_foreign_key(batch_op.f('fk_submissions_reviewed_by_users_email'), 'users', ['reviewed_by'], ['email'])
        batch_op.alter_column('raw_score',
               existing_type=sa.FLOAT(),
               nullable=True)

    with op.batch_alter_table('course_materials', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_course_materials_status'))
        batch_op.drop_index(batch_op.f('ix_course_materials_file_hash'))
        batch_op.drop_index(batch_op.f('ix_course_materials_created_by_email'))
        batch_op.drop_index(batch_op.f('ix_course_materials_content_hash'))

    op.drop_table('course_materials')