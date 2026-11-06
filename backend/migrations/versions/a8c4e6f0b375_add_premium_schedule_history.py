"""Audit adjustments to queued renewals after withdrawal of an earlier purchase."""
from alembic import op
import sqlalchemy as sa

revision = "a8c4e6f0b375"
down_revision = "f7b3d5e9a264"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("premium_orders", sa.Column("service_schedule_history", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("premium_orders", "service_schedule_history")
