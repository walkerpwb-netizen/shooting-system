"""Persist individual verified Autopay receipts for annual reporting.

Revision ID: b3d7e9f1a620
Revises: 9c7b2d4e6f18
"""
from alembic import op
import sqlalchemy as sa

revision = "b3d7e9f1a620"
down_revision = "9c7b2d4e6f18"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "autopay_receipts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_id", sa.String(32), sa.ForeignKey("premium_orders.id", ondelete="SET NULL")),
        sa.Column("order_reference", sa.String(32), nullable=False),
        sa.Column("service_id", sa.String(10), nullable=False),
        sa.Column("remote_id", sa.String(20), nullable=False),
        sa.Column("environment", sa.String(10), nullable=False),
        sa.Column("amount_grosz", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("paid_on", sa.Date(), nullable=False),
        *[sa.Column(name, sa.String(), nullable=False) for name in ("paid_at", "recorded_at")],
        sa.Column("provider_payment_date", sa.String(14), nullable=False),
        sa.Column("package", sa.String(20), nullable=False),
        sa.Column("period", sa.String(10), nullable=False),
        sa.Column("payer_name", sa.String(255), nullable=False),
        sa.Column("payer_email", sa.String(255), nullable=False),
        sa.UniqueConstraint("environment", "service_id", "remote_id", name="uq_autopay_receipt_transaction"),
    )
    op.create_index("ix_autopay_receipts_environment_paid_on", "autopay_receipts", ["environment", "paid_on"])


def downgrade():
    op.drop_index("ix_autopay_receipts_environment_paid_on", table_name="autopay_receipts")
    op.drop_table("autopay_receipts")
