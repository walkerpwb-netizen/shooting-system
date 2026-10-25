"""Snapshot estimated Standard fees, separately from gross receipts.

Revision ID: c4e8a2b6d931
Revises: b3d7e9f1a620
"""
from alembic import op
import sqlalchemy as sa

revision = "c4e8a2b6d931"
down_revision = "b3d7e9f1a620"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("autopay_receipts", sa.Column("estimated_fee_grosz", sa.Integer(), nullable=True))
    op.add_column("autopay_receipts", sa.Column("fee_tariff", sa.String(100), nullable=True))
    receipts = sa.table("autopay_receipts", sa.column("amount_grosz", sa.Integer()),
                        sa.column("estimated_fee_grosz", sa.Integer()), sa.column("fee_tariff", sa.String()))
    # Round half up per transaction; bigint avoids overflow for the largest accepted receipt.
    fee = sa.cast(sa.func.floor((sa.cast(receipts.c.amount_grosz, sa.BigInteger()) * 119 + 5000) / 10000), sa.Integer()) + 34
    op.execute(receipts.update().values(estimated_fee_grosz=fee, fee_tariff="Standard: 1,19% + 0,34 zł"))
    with op.batch_alter_table("autopay_receipts") as batch:
        batch.alter_column("estimated_fee_grosz", existing_type=sa.Integer(), nullable=False)
        batch.alter_column("fee_tariff", existing_type=sa.String(100), nullable=False)


def downgrade():
    with op.batch_alter_table("autopay_receipts") as batch:
        batch.drop_column("fee_tariff")
        batch.drop_column("estimated_fee_grosz")
