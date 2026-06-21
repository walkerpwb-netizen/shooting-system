"""add pzss club accounts

Revision ID: f2a6c9d4b8e1
Revises: e4a9b7c2d8f5
Create Date: 2026-06-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f2a6c9d4b8e1"
down_revision: Union[str, Sequence[str], None] = "e4a9b7c2d8f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("account_type", sa.String(), nullable=True))
    op.add_column("users", sa.Column("pzss_club_short_name", sa.String(), nullable=True))
    op.add_column("users", sa.Column("pzss_club_full_name", sa.String(), nullable=True))
    op.add_column("users", sa.Column("pzss_club_license_number", sa.String(), nullable=True))
    op.add_column("users", sa.Column("pzss_club_status", sa.String(), nullable=True))
    op.add_column("users", sa.Column("verified_club_id", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("club_membership_status", sa.String(), nullable=True))

    op.execute("UPDATE users SET account_type = 'user' WHERE account_type IS NULL")
    op.create_foreign_key(
        "fk_users_verified_club_id_users",
        "users",
        "users",
        ["verified_club_id"],
        ["id"],
    )
    op.create_index("ix_users_account_type", "users", ["account_type"], unique=False)
    op.create_index("ix_users_pzss_club_status", "users", ["pzss_club_status"], unique=False)
    op.create_index("ix_users_verified_club_id", "users", ["verified_club_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_users_verified_club_id", table_name="users")
    op.drop_index("ix_users_pzss_club_status", table_name="users")
    op.drop_index("ix_users_account_type", table_name="users")
    op.drop_constraint("fk_users_verified_club_id_users", "users", type_="foreignkey")
    op.drop_column("users", "club_membership_status")
    op.drop_column("users", "verified_club_id")
    op.drop_column("users", "pzss_club_status")
    op.drop_column("users", "pzss_club_license_number")
    op.drop_column("users", "pzss_club_full_name")
    op.drop_column("users", "pzss_club_short_name")
    op.drop_column("users", "account_type")
