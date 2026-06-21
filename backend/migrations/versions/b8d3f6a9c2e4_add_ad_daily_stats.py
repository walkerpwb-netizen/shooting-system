"""add ad daily stats

Revision ID: b8d3f6a9c2e4
Revises: a6b4c8d2e5f1
Create Date: 2026-06-01 01:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b8d3f6a9c2e4"
down_revision: Union[str, Sequence[str], None] = "a6b4c8d2e5f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ad_daily_stats",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("date", sa.String(), nullable=False),
        sa.Column("slot", sa.String(), nullable=False),
        sa.Column("device", sa.String(), nullable=False),
        sa.Column("impressions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("clicks", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("date", "slot", "device", name="uq_ad_daily_stats_date_slot_device"),
    )
    op.create_index(op.f("ix_ad_daily_stats_id"), "ad_daily_stats", ["id"], unique=False)
    op.create_index(op.f("ix_ad_daily_stats_date"), "ad_daily_stats", ["date"], unique=False)
    op.create_index(op.f("ix_ad_daily_stats_slot"), "ad_daily_stats", ["slot"], unique=False)
    op.create_index(op.f("ix_ad_daily_stats_device"), "ad_daily_stats", ["device"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_ad_daily_stats_device"), table_name="ad_daily_stats")
    op.drop_index(op.f("ix_ad_daily_stats_slot"), table_name="ad_daily_stats")
    op.drop_index(op.f("ix_ad_daily_stats_date"), table_name="ad_daily_stats")
    op.drop_index(op.f("ix_ad_daily_stats_id"), table_name="ad_daily_stats")
    op.drop_table("ad_daily_stats")
