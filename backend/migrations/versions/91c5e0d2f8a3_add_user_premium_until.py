"""add user premium until

Revision ID: 91c5e0d2f8a3
Revises: 7d9a2f4c6b1e
Create Date: 2026-05-31 22:55:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "91c5e0d2f8a3"
down_revision: Union[str, Sequence[str], None] = "7d9a2f4c6b1e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


PREMIUM_UNTIL = "2026-12-31T23:59:59+01:00"


def upgrade() -> None:
    op.add_column("users", sa.Column("premium_until", sa.String(), nullable=True))
    op.execute(
        sa.text("UPDATE users SET premium_until = :premium_until")
        .bindparams(premium_until=PREMIUM_UNTIL)
    )


def downgrade() -> None:
    op.drop_column("users", "premium_until")
