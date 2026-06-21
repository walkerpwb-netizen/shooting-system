"""add discipline result data

Revision ID: c6d7e8f9a0b1
Revises: b3c4d5e6f7a8
Create Date: 2026-06-16 17:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c6d7e8f9a0b1"
down_revision: Union[str, Sequence[str], None] = "b3c4d5e6f7a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "discipline_results",
        sa.Column("result_data", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("discipline_results", "result_data")
