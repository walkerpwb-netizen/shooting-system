"""Archive identical duplicate results and enforce one result per discipline.

Revision ID: 2a9e7c4d6b10
Revises: 5c7e9a1b3d6f
"""

from alembic import op
import sqlalchemy as sa


revision = "2a9e7c4d6b10"
down_revision = "5c7e9a1b3d6f"
branch_labels = None
depends_on = None

INDEX_NAME = "uq_discipline_results_participant_discipline"
ARCHIVE_TABLE = "discipline_result_duplicate_archive"


def upgrade():
    connection = op.get_bind()
    if connection.dialect.name == "postgresql":
        # Keep reads available, but prevent a new duplicate during cleanup.
        connection.execute(sa.text("SET LOCAL lock_timeout = '5s'"))
        connection.execute(sa.text("SET LOCAL statement_timeout = '30s'"))
        connection.execute(sa.text("LOCK TABLE discipline_results IN SHARE ROW EXCLUSIVE MODE"))

    results = sa.Table("discipline_results", sa.MetaData(), autoload_with=connection)
    groups = connection.execute(
        sa.select(results.c.participant_id, results.c.discipline_id)
        .group_by(results.c.participant_id, results.c.discipline_id)
        .having(sa.func.count() > 1)
    ).all()
    duplicates = []
    for participant_id, discipline_id in groups:
        rows = connection.execute(
            sa.select(results)
            .where(
                results.c.participant_id == participant_id,
                results.c.discipline_id == discipline_id,
            )
            .order_by(results.c.id)
        ).mappings().all()
        kept = rows[0]
        for row in rows[1:]:
            if any(row[column.name] != kept[column.name] for column in results.c if column.name != "id"):
                raise RuntimeError(
                    f"Conflicting result IDs {kept['id']} and {row['id']}; reconcile before migration"
                )
            duplicates.append({**dict(row), "kept_result_id": kept["id"]})

    archive = sa.Table(
        ARCHIVE_TABLE, sa.MetaData(),
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=False),
        sa.Column("competition_id", sa.Integer(), nullable=False),
        sa.Column("discipline_id", sa.Integer(), nullable=False),
        sa.Column("participant_id", sa.Integer(), nullable=False),
        sa.Column("judge_email", sa.String(), nullable=False),
        sa.Column("points", sa.String(), nullable=False),
        sa.Column("result_data", sa.Text(), nullable=True),
        sa.Column("kept_result_id", sa.Integer(), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    archive.create(connection, checkfirst=True)
    if duplicates:
        connection.execute(archive.insert(), duplicates)
        connection.execute(results.delete().where(results.c.id.in_([row["id"] for row in duplicates])))

    op.create_index(INDEX_NAME, "discipline_results", ["participant_id", "discipline_id"], unique=True)


def downgrade():
    op.drop_index(INDEX_NAME, table_name="discipline_results")
    # Preserve the archive and corrected scores across a rollback.
