"""Persist sandbox Premium orders and consent/offer snapshots.

Revision ID: 8f3a6c9d2e41
Revises: 7d4a9b2c6e10
"""
from alembic import op
import sqlalchemy as sa

revision = "8f3a6c9d2e41"
down_revision = "7d4a9b2c6e10"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "premium_orders",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        *[sa.Column(name, sa.String(size), nullable=False) for name, size in (
            ("package", 20), ("period", 10), ("amount", 20), ("currency", 3),
            ("environment", 10), ("service_id", 10), ("status", 20), ("terms_version", 30))],
        sa.Column("remote_id", sa.String(20)),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("paid_at", sa.String()),
        sa.Column("terms_accepted_at", sa.String(), nullable=False),
        sa.Column("offer_snapshot", sa.Text(), nullable=False),
    )
    op.create_index("ix_premium_orders_user_id", "premium_orders", ["user_id"])


def downgrade():
    op.drop_index("ix_premium_orders_user_id", table_name="premium_orders")
    op.drop_table("premium_orders")
