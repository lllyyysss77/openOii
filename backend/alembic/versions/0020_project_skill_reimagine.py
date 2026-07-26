"""add skill_id and reimagine_meta to project

Revision ID: 0020
Revises: 0013_storyboard_elements_reviews_exports

幂等实现：init_db() 在迁移失败时会回退到 create_all()，由此引导的库会先有模型列、
后有迁移记录。该迁移需要能在"列已存在、索引未建"的半应用状态下收敛，否则每次启动
都会因 DuplicateColumn 失败并再次回退。
"""

from alembic import op
import sqlalchemy as sa

revision = "0020_project_skill_reimagine"
down_revision = "0013_storyboard_elements_reviews_exports"
branch_labels = None
depends_on = None


def _existing_columns(bind) -> set[str]:
    return {col["name"] for col in sa.inspect(bind).get_columns("project")}


def _existing_indexes(bind) -> set[str]:
    return {idx["name"] for idx in sa.inspect(bind).get_indexes("project")}


def upgrade() -> None:
    bind = op.get_bind()
    columns = _existing_columns(bind)

    if "skill_id" not in columns:
        op.add_column("project", sa.Column("skill_id", sa.String(), nullable=True))
    if "reimagine_meta" not in columns:
        op.add_column("project", sa.Column("reimagine_meta", sa.JSON(), nullable=True))
    if "ix_project_skill_id" not in _existing_indexes(bind):
        op.create_index("ix_project_skill_id", "project", ["skill_id"])


def downgrade() -> None:
    bind = op.get_bind()

    if "ix_project_skill_id" in _existing_indexes(bind):
        op.drop_index("ix_project_skill_id", table_name="project")

    columns = _existing_columns(bind)
    if "reimagine_meta" in columns:
        op.drop_column("project", "reimagine_meta")
    if "skill_id" in columns:
        op.drop_column("project", "skill_id")
