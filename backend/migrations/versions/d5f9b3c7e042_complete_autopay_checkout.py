"""Autopay contracts, event publications, diagnostics and mail outbox.

Revision ID: d5f9b3c7e042
Revises: c4e8a2b6d931
"""
from alembic import op
import sqlalchemy as sa

revision = "d5f9b3c7e042"
down_revision = "c4e8a2b6d931"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("premium_orders") as batch:
        batch.add_column(sa.Column("competition_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_premium_order_competition", "competitions", ["competition_id"], ["id"], ondelete="SET NULL")
        batch.create_index("ix_premium_orders_competition_id", ["competition_id"])
        batch.add_column(sa.Column("early_start_requested", sa.Integer(), nullable=False, server_default="0"))
        for name in ("publication_granted_at", "service_starts_at", "service_ends_at", "gateway_valid_until",
                     "provider_closed_at", "cancel_message_id", "last_status_check_at", "request_id", "refunded_at"):
            batch.add_column(sa.Column(name, sa.String(36) if name == "request_id" else sa.String(32) if name == "cancel_message_id" else sa.String(), nullable=True))
        for name in ("contract_snapshot", "fulfillment_preview"):
            batch.add_column(sa.Column(name, sa.Text(), nullable=True))
        batch.create_unique_constraint("uq_premium_order_request", ["request_id"])
    op.create_table("premium_notifications", sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("digest", sa.String(64), nullable=False, unique=True),
        sa.Column("environment", sa.String(10), nullable=False), sa.Column("service_id", sa.String(10), nullable=False),
        sa.Column("order_reference", sa.String(32), nullable=False), sa.Column("remote_id", sa.String(20), nullable=False),
        sa.Column("payment_status", sa.String(20), nullable=False), sa.Column("confirmation", sa.String(25), nullable=False),
        sa.Column("first_seen_at", sa.String(), nullable=False), sa.Column("last_seen_at", sa.String(), nullable=False),
        sa.Column("deliveries", sa.Integer(), nullable=False))
    op.create_table("premium_mail_outbox", sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_id", sa.String(32), sa.ForeignKey("premium_orders.id", ondelete="SET NULL"), unique=True),
        sa.Column("recipient", sa.String(255), nullable=False), sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False), sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("sent_at", sa.String()), sa.Column("attempted_at", sa.String()),
        sa.Column("attempts", sa.Integer(), nullable=False), sa.Column("error", sa.String(255)))
    op.create_table("premium_refunds", sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("order_id", sa.String(32), sa.ForeignKey("premium_orders.id", ondelete="SET NULL")),
        sa.Column("receipt_id", sa.Integer(), sa.ForeignKey("autopay_receipts.id", ondelete="SET NULL")),
        sa.Column("remote_id", sa.String(20), nullable=False), sa.Column("environment", sa.String(10), nullable=False),
        sa.Column("amount_grosz", sa.Integer(), nullable=False), sa.Column("status", sa.String(20), nullable=False),
        sa.Column("provider_status", sa.String(100)), sa.Column("provider_remote_id", sa.String(100)),
        sa.Column("created_at", sa.String(), nullable=False), sa.Column("updated_at", sa.String(), nullable=False))


def downgrade():
    op.drop_table("premium_refunds")
    op.drop_table("premium_mail_outbox")
    op.drop_table("premium_notifications")
    with op.batch_alter_table("premium_orders") as batch:
        batch.drop_constraint("uq_premium_order_request", type_="unique")
        batch.drop_index("ix_premium_orders_competition_id")
        batch.drop_constraint("fk_premium_order_competition", type_="foreignkey")
        for name in ("competition_id", "early_start_requested", "publication_granted_at", "service_starts_at",
                     "service_ends_at", "gateway_valid_until", "provider_closed_at", "cancel_message_id",
                     "last_status_check_at", "request_id", "contract_snapshot", "fulfillment_preview", "refunded_at"):
            batch.drop_column(name)
