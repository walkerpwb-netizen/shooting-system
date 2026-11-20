import unittest
import asyncio
import json
import os
import tempfile
from pathlib import Path
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi import FastAPI, HTTPException

import meta_news
from database import Base
from models import MetaNewsPost, MetaNewsStatus


class MetaNewsSyncTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine, tables=[MetaNewsPost.__table__, MetaNewsStatus.__table__])
        self.sessions = sessionmaker(bind=self.engine, expire_on_commit=False)
        self.patch_session = patch.object(meta_news, "SessionLocal", self.sessions)
        self.patch_session.start()
        self.addCleanup(self.patch_session.stop)
        self.addCleanup(self.engine.dispose)

    def record(self, identifier, text):
        return {"source": "facebook", "source_id": identifier, "text": text,
                "published_at": "2026-11-20T12:00:00+00:00", "permalink": "https://facebook.com/p/1", "media": []}

    def test_failure_keeps_cached_posts_and_alerts_once(self):
        with patch.object(meta_news, "collect", return_value=([self.record("a", "first")], {"a"})):
            meta_news.sync_source("facebook", "token")
        with patch.object(meta_news, "collect", side_effect=meta_news.SyncError("problem")), patch.object(meta_news, "alert", return_value=True) as alert:
            for _ in range(3):
                meta_news.sync_source("facebook", "token")
            self.assertEqual(alert.call_count, 1)
        with self.sessions() as db:
            self.assertEqual(db.query(MetaNewsPost).one().text, "first")
            self.assertEqual(db.get(MetaNewsStatus, "facebook").failures, 3)

    def test_tag_removal_deletes_only_observed_post(self):
        with patch.object(meta_news, "collect", return_value=([self.record("a", "first"), self.record("b", "second")], {"a", "b"})):
            meta_news.sync_source("facebook", "token")
        with patch.object(meta_news, "collect", return_value=([], {"a"})):
            meta_news.sync_source("facebook", "token")
        with self.sessions() as db:
            self.assertEqual([item.source_id for item in db.query(MetaNewsPost).all()], ["b"])
        with patch.object(meta_news, "collect", return_value=([], set())):
            meta_news.sync_source("facebook", "token")
        with self.sessions() as db:
            self.assertEqual(db.query(MetaNewsPost).count(), 0)

    def test_failure_interrupts_missing_confirmation(self):
        with patch.object(meta_news, "collect", return_value=([self.record("a", "first")], {"a"})):
            meta_news.sync_source("facebook", "token")
        with patch.object(meta_news, "collect", return_value=([], set())):
            meta_news.sync_source("facebook", "token")
        with patch.object(meta_news, "collect", side_effect=meta_news.SyncError("problem")):
            meta_news.sync_source("facebook", "token")
        with patch.object(meta_news, "collect", return_value=([], set())):
            meta_news.sync_source("facebook", "token")
        with self.sessions() as db:
            self.assertEqual(db.query(MetaNewsPost).count(), 1)

    def test_repeated_cursor_fails_instead_of_returning_partial_data(self):
        response = {"data": [], "paging": {"next": "https://example.invalid/secret", "cursors": {"after": "same"}}}
        with patch.object(meta_news, "graph_page", return_value=response):
            with self.assertRaises(meta_news.SyncError):
                meta_news.collect("facebook", "token")

    def test_credentials_are_private_and_not_in_graph_url(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / "token"
            meta_news.write_secret("sensitive-token", destination)
            self.assertEqual(destination.read_text(), "sensitive-token")
            self.assertEqual(os.stat(destination).st_mode & 0o777, 0o600)
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, *args): return b'{"data":[]}'
        class Opener:
            def open(self, request, timeout):
                self.request = request
                return Response()
        opener = Opener()
        with patch.object(meta_news, "build_opener", return_value=opener):
            meta_news.graph_page("123/posts", "id", "sensitive-token")
        self.assertNotIn("sensitive-token", opener.request.full_url)
        self.assertEqual(opener.request.get_header("Authorization"), "Bearer sensitive-token")

    def test_only_admin_can_save_a_token_and_response_does_not_echo_it(self):
        async def call(app, path, body):
            messages = []
            sent = False
            async def receive():
                nonlocal sent
                if sent:
                    return {"type": "http.disconnect"}
                sent = True
                return {"type": "http.request", "body": body, "more_body": False}
            async def send(message):
                messages.append(message)
            scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "POST",
                     "scheme": "https", "path": path, "raw_path": path.encode(), "query_string": b"",
                     "root_path": "", "headers": [(b"content-type", b"application/json")], "client": ("127.0.0.1", 1234), "server": ("test", 443)}
            await app(scope, receive, send)
            status = next(m["status"] for m in messages if m["type"] == "http.response.start")
            response = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body")
            return status, response
        def deny(): raise HTTPException(status_code=403)
        def allow(): return object()
        def get_db():
            with self.sessions() as db:
                yield db
        body = json.dumps({"token": "sensitive-token"}).encode()
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "token"
            with patch.object(meta_news, "TOKEN_PATH", target), patch.object(meta_news, "sync_all"):
                denied = FastAPI(); denied.include_router(meta_news.build_meta_news_router(get_db, deny))
                status, response = asyncio.run(call(denied, "/admin/meta-news/token", body))
                self.assertEqual(status, 403)
                self.assertFalse(target.exists())
                allowed = FastAPI(); allowed.include_router(meta_news.build_meta_news_router(get_db, allow))
                status, response = asyncio.run(call(allowed, "/admin/meta-news/token", body))
                self.assertEqual(status, 200)
                self.assertNotIn(b"sensitive-token", response)
                self.assertEqual(target.read_text(), "sensitive-token")


if __name__ == "__main__":
    unittest.main()
