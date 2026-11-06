"""Separate withdrawal of Premium access from the settlement of a refund."""
from alembic import op
import sqlalchemy as sa

revision = "f7b3d5e9a264"
down_revision = "5b8f1c4a7d92"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("premium_orders") as batch:
        batch.add_column(sa.Column("refund_requested_at", sa.String(), nullable=True))
        batch.add_column(sa.Column("refund_requested_by", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_premium_refund_requested_by", "users", ["refund_requested_by"], ["id"], ondelete="SET NULL")
    with op.batch_alter_table("premium_refunds") as batch:
        batch.add_column(sa.Column("last_checked_at", sa.String(), nullable=True))
        batch.add_column(sa.Column("error", sa.String(255), nullable=True))


def downgrade():
    with op.batch_alter_table("premium_refunds") as batch:
        batch.drop_column("error")
        batch.drop_column("last_checked_at")
    with op.batch_alter_table("premium_orders") as batch:
        batch.drop_constraint("fk_premium_refund_requested_by", type_="foreignkey")
        batch.drop_column("refund_requested_by")
        batch.drop_column("refund_requested_at")
