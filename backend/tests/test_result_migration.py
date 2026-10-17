import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

from alembic.migration import MigrationContext
from alembic.operations import Operations
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError


path = Path(__file__).resolve().parents[1] / "migrations/versions/2a9e7c4d6b10_unique_discipline_results.py"
spec = importlib.util.spec_from_file_location("result_migration", path)
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


class ResultMigrationTests(unittest.TestCase):
    def setUp(self):
        self.engine = sa.create_engine("sqlite://")
        self.connection = self.engine.connect()
        self.results = sa.Table(
            "discipline_results", sa.MetaData(),
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("competition_id", sa.Integer(), nullable=False),
            sa.Column("discipline_id", sa.Integer(), nullable=False),
            sa.Column("participant_id", sa.Integer(), nullable=False),
            sa.Column("judge_email", sa.String(), nullable=False),
            sa.Column("points", sa.String(), nullable=False),
            sa.Column("result_data", sa.Text()),
        )
        self.results.create(self.connection)

    def tearDown(self):
        self.connection.close()
        self.engine.dispose()

    def insert(self, row_id, participant=1, discipline=1, points="78", details=None):
        self.connection.execute(self.results.insert().values(
            id=row_id, competition_id=1, discipline_id=discipline, participant_id=participant,
            judge_email="judge@example.test", points=points, result_data=details,
        ))

    def upgrade(self):
        with patch.object(migration, "op", Operations(MigrationContext.configure(self.connection))):
            migration.upgrade()

    def test_archives_only_identical_duplicates_and_enforces_uniqueness(self):
        self.insert(1)
        self.insert(2)
        self.insert(3)
        self.insert(4, participant=2, points="93", details='{"base_points":"93"}')
        self.insert(5, participant=2, points="93", details='{"base_points":"93"}')
        self.insert(6, discipline=2, points="97")
        self.upgrade()
        rows = self.connection.execute(sa.select(self.results).order_by(self.results.c.id)).mappings().all()
        self.assertEqual([row["id"] for row in rows], [1, 4, 6])
        archive = sa.Table(migration.ARCHIVE_TABLE, sa.MetaData(), autoload_with=self.connection)
        saved = self.connection.execute(sa.select(archive).order_by(archive.c.id)).mappings().all()
        self.assertEqual([row["id"] for row in saved], [2, 3, 5])
        self.assertEqual([row["kept_result_id"] for row in saved], [1, 1, 4])
        self.assertEqual(saved[2]["result_data"], '{"base_points":"93"}')
        self.assertTrue(all(row["archived_at"] for row in saved))
        with self.assertRaises(IntegrityError):
            self.insert(7)

    def test_refuses_conflicting_points_without_deleting_any_result(self):
        self.insert(1)
        self.insert(2)
        self.insert(3, participant=2, points="93")
        self.insert(4, participant=2, points="97")
        with self.assertRaisesRegex(RuntimeError, "Conflicting result IDs"):
            self.upgrade()
        self.assertEqual(self.connection.scalar(sa.select(sa.func.count()).select_from(self.results)), 4)

    def test_refuses_different_details_even_with_identical_points(self):
        self.insert(1, details='{"one_hand_bonus":true}')
        self.insert(2, details='{"one_hand_bonus":false}')
        with self.assertRaisesRegex(RuntimeError, "Conflicting result IDs"):
            self.upgrade()
        self.assertEqual(self.connection.scalar(sa.select(sa.func.count()).select_from(self.results)), 2)

    def test_empty_database_and_downgrade_preserve_archive(self):
        self.upgrade()
        operations = Operations(MigrationContext.configure(self.connection))
        with patch.object(migration, "op", operations):
            migration.downgrade()
        self.assertTrue(sa.inspect(self.connection).has_table(migration.ARCHIVE_TABLE))
        self.upgrade()
