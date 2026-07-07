"""add shooting range overrides

Revision ID: 8a3f6d1c9b20
Revises: 7b2d9f4a6c10
Create Date: 2026-07-07 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "8a3f6d1c9b20"
down_revision: Union[str, Sequence[str], None] = "7b2d9f4a6c10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "shooting_range_overrides",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("range_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("phone", sa.String(), nullable=False),
        sa.Column("website", sa.String(), nullable=False),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
        sa.Column("updated_by", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("range_id"),
    )
    op.create_index(op.f("ix_shooting_range_overrides_id"), "shooting_range_overrides", ["id"], unique=False)
    op.create_index(op.f("ix_shooting_range_overrides_range_id"), "shooting_range_overrides", ["range_id"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_shooting_range_overrides_range_id"), table_name="shooting_range_overrides")
    op.drop_index(op.f("ix_shooting_range_overrides_id"), table_name="shooting_range_overrides")
    op.drop_table("shooting_range_overrides")
