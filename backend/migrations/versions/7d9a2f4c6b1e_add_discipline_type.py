"""add discipline type

Revision ID: 7d9a2f4c6b1e
Revises: 3b7f2c9d1a4e
Create Date: 2026-05-31 16:35:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7d9a2f4c6b1e"
down_revision: Union[str, Sequence[str], None] = "3b7f2c9d1a4e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "disciplines",
        sa.Column(
            "discipline_type",
            sa.String(),
            nullable=False,
            server_default="",
        ),
    )

    op.execute(
        """
        UPDATE disciplines
        SET discipline_type = CASE
            WHEN lower(coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(ammo_type, '')) LIKE '%strzelba%'
              OR lower(coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(ammo_type, '')) LIKE '%shotgun%'
              OR lower(coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(ammo_type, '')) LIKE '%trap%'
              OR lower(coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(ammo_type, '')) LIKE '%skeet%'
              OR lower(coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(ammo_type, '')) LIKE '%12/70%'
              OR lower(coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(ammo_type, '')) LIKE '%12/76%'
            THEN 'shotgun'
            WHEN lower(coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(ammo_type, '')) LIKE '%karabin%'
              OR lower(coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(ammo_type, '')) LIKE '%rifle%'
              OR lower(coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(ammo_type, '')) LIKE '%kbks%'
              OR lower(coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(ammo_type, '')) LIKE '%carbine%'
              OR lower(coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(ammo_type, '')) LIKE '%.223%'
              OR lower(coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(ammo_type, '')) LIKE '%.308%'
            THEN 'rifle'
            WHEN lower(coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(ammo_type, '')) LIKE '%pistolet%'
              OR lower(coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(ammo_type, '')) LIKE '%pistol%'
              OR lower(coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(ammo_type, '')) LIKE '%handgun%'
              OR lower(coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(ammo_type, '')) LIKE '%9mm%'
              OR lower(coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(ammo_type, '')) LIKE '%19mm%'
              OR lower(coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(ammo_type, '')) LIKE '%.45%'
            THEN 'pistol'
            ELSE ''
        END
        """
    )


def downgrade() -> None:
    op.drop_column("disciplines", "discipline_type")
