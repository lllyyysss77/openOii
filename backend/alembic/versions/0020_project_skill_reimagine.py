"""add skill_id and reimagine_meta to project

Revision ID: 0020
Revises: 0019
"""

from alembic import op
import sqlalchemy as sa

revision = "0020_project_skill_reimagine"
down_revision = "0019_create_universe_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("project", sa.Column("skill_id", sa.String(), nullable=True))
    op.add_column("project", sa.Column("reimagine_meta", sa.JSON(), nullable=True))
    op.create_index("ix_project_skill_id", "project", ["skill_id"])


def downgrade() -> None:
    op.drop_index("ix_project_skill_id", table_name="project")
    op.drop_column("project", "reimagine_meta")
    op.drop_column("project", "skill_id")
