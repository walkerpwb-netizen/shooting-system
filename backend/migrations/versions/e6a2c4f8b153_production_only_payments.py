"""Remove retired payment data and unused fulfillment preview.

Revision ID: e6a2c4f8b153
Revises: d5f9b3c7e042
"""
from alembic import op
import sqlalchemy as sa

revision = 'e6a2c4f8b153'
down_revision = 'd5f9b3c7e042'
branch_labels = None
depends_on = None


def upgrade():
    # The operator's production records and their contract snapshots are immutable.
    op.execute("DELETE FROM premium_mail_outbox WHERE order_id IN (SELECT id FROM premium_orders WHERE environment <> 'production')")
    for table in ('premium_refunds', 'autopay_receipts', 'premium_notifications', 'premium_orders'):
        op.execute(sa.text(f"DELETE FROM {table} WHERE environment <> 'production'"))
    with op.batch_alter_table('premium_orders') as batch:
        batch.drop_column('fulfillment_preview')


def downgrade():
    # Only the schema can be restored; intentionally removed retired data stays removed.
    with op.batch_alter_table('premium_orders') as batch:
        batch.add_column(sa.Column('fulfillment_preview', sa.Text(), nullable=True))
