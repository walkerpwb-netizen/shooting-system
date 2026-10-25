"""Separate paid Premium periods and record idempotent fulfillment.

Revision ID: 9c7b2d4e6f18
Revises: 8f3a6c9d2e41
"""
from alembic import op
import sqlalchemy as sa

revision = "9c7b2d4e6f18"
down_revision = "8f3a6c9d2e41"
branch_labels = None
depends_on = None


def upgrade():
    for name in ("premium_shooter_paid_until", "premium_organizer_paid_until"):
        op.add_column("users", sa.Column(name, sa.String(), nullable=True))
    for name in ("entitlement_starts_at", "entitlement_ends_at", "entitlements_applied_at"):
        op.add_column("premium_orders", sa.Column(name, sa.String(), nullable=True))


def downgrade():
    for name in ("entitlements_applied_at", "entitlement_ends_at", "entitlement_starts_at"):
        op.drop_column("premium_orders", name)
    for name in ("premium_organizer_paid_until", "premium_shooter_paid_until"):
        op.drop_column("users", name)
