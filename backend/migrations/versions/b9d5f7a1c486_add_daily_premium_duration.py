"""Immutable number of purchased days for the private daily Premium offer."""
from alembic import op
import sqlalchemy as sa

revision = "b9d5f7a1c486"
down_revision = "a8c4e6f0b375"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("premium_orders", sa.Column("duration_days", sa.Integer(), nullable=True))
    op.add_column("autopay_receipts", sa.Column("duration_days", sa.Integer(), nullable=True))


def downgrade():
    op.drop_column("autopay_receipts", "duration_days")
    op.drop_column("premium_orders", "duration_days")
