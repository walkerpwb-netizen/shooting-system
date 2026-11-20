"""Meta news collection. Credentials are private and never included in logs."""

import asyncio
import fcntl
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi import Request as FastAPIRequest

from config import settings
from database import SessionLocal
from mailer import send_email
from meta_news_normalize import normalize_post
from models import MetaNewsPost, MetaNewsStatus

TOKEN_PATH = Path(__file__).resolve().parent / ".private" / "meta-page-token"
APP_SECRET_PATH = TOKEN_PATH.with_name("meta-app-secret")
APP_ID = "3135346213476268"
GRAPH = "https://graph.facebook.com/v24.0"
SOURCES = {
    "facebook": ("1245985325257942/posts", "id,message,created_time,permalink_url,attachments{media,type,subattachments{media,type}}"),
    "instagram": ("17841416134044047/media", "id,caption,media_type,permalink,timestamp,media_url,thumbnail_url,children{id,media_type,media_url,thumbnail_url}"),
}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class SyncError(Exception):
    pass


def graph_page(path, fields, token, after=None):
    params = {"fields": fields, "limit": 100}
    if after:
        params["after"] = after
    request = Request(f"{GRAPH}/{path}?{urlencode(params)}", headers={"Authorization": f"Bearer {token}"})
    try:
        with build_opener(NoRedirect).open(request, timeout=20) as response:
            result = json.load(response)
    except (HTTPError, URLError, ValueError, OSError):
        raise SyncError("Nie udało się odczytać danych Meta. Sprawdź token i uprawnienia.") from None
    if not isinstance(result, dict) or not isinstance(result.get("data"), list):
        raise SyncError("Meta zwróciła nieprawidłową odpowiedź.")
    return result


def collect(source, token):
    path, fields = SOURCES[source]
    cursor = None
    seen_cursors = set()
    posts = []
    observed = set()
    for _ in range(1000):
        page = graph_page(path, fields, token, cursor)
        for raw in page["data"]:
            if not isinstance(raw, dict):
                raise SyncError("Meta zwróciła nieprawidłowy wpis.")
            if not isinstance(raw.get("id"), str) or not raw["id"]:
                raise SyncError("Meta zwróciła wpis bez identyfikatora.")
            observed.add(raw["id"])
            try:
                post = normalize_post(source, raw)
            except (ValueError, TypeError, AttributeError):
                raise SyncError("Meta zwróciła niekompletny wpis aktualności.") from None
            if post:
                # A partial nested album cannot be treated as a complete media list.
                nested = [raw.get("children") or {}]
                for attachment in (raw.get("attachments") or {}).get("data", []):
                    nested.append(attachment.get("subattachments") or {})
                if (raw.get("attachments") or {}).get("paging", {}).get("next") or any(x.get("paging", {}).get("next") for x in nested):
                    raise SyncError("Album wymaga dodatkowego pobrania zdjęć.")
                posts.append(post)
        paging = page.get("paging") or {}
        if not paging.get("next"):
            return posts, observed
        cursor = (paging.get("cursors") or {}).get("after")
        if not cursor or cursor in seen_cursors:
            raise SyncError("Nie można odczytać kolejnej strony wyników Meta.")
        seen_cursors.add(cursor)
    raise SyncError("Przekroczono limit stron wyników Meta.")


def write_secret(value, destination=None):
    destination = destination or TOKEN_PATH
    token = value.strip()
    if not token or len(token) > 8192 or any(c.isspace() for c in token):
        raise ValueError("Nieprawidłowy format tokenu.")
    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=".meta-secret-", dir=destination.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(token)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, destination)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def alert(subject, text):
    if not settings.admin_new_user_notification_email:
        return False
    try:
        send_email(settings.admin_new_user_notification_email, subject, text, copy_to_admin=False)
        return True
    except Exception:
        # Mail exceptions can contain sensitive details. The panel remains available.
        return False


def sync_source(source, token):
    db = SessionLocal()
    now = datetime.now(timezone.utc).isoformat()
    try:
        state = db.get(MetaNewsStatus, source)
        if state is None:
            state = MetaNewsStatus(source=source, failures=0, alert_sent=False)
            db.add(state)
        state.last_attempt_at = now
        try:
            if not token:
                raise SyncError("Brak skonfigurowanego tokenu Meta.")
            posts, observed = collect(source, token)
            identifiers = {p["source_id"] for p in posts}
            if len(identifiers) != len(posts):
                raise SyncError("Meta zwróciła powtórzone identyfikatory wpisów.")
            existing = {p.source_id: p for p in db.query(MetaNewsPost).filter_by(source=source).all()}
            for post in posts:
                row = existing.get(post["source_id"])
                if row is None:
                    row = MetaNewsPost(source=source, source_id=post["source_id"])
                    db.add(row)
                row.text, row.published_at, row.permalink = post["text"], post["published_at"], post["permalink"]
                row.media_json = json.dumps(post["media"], ensure_ascii=False)
                row.missing_count = 0
            for key, row in existing.items():
                if key in observed and key not in identifiers:
                    db.delete(row)
                elif key not in observed:
                    # Require two complete scans before acting on an absent post.
                    row.missing_count = (row.missing_count or 0) + 1
                    if row.missing_count >= 2:
                        db.delete(row)
            previously_alerted = state.alert_sent
            state.last_success_at, state.error, state.failures, state.alert_sent = now, None, 0, False
            db.commit()
            if previously_alerted:
                alert("Aktualności Meta: połączenie przywrócone", f"Synchronizacja {source} działa ponownie.")
        except SyncError as error:
            state.error, state.failures = str(error), state.failures + 1
            for row in db.query(MetaNewsPost).filter_by(source=source).all():
                row.missing_count = 0
            if state.failures >= 2 and not state.alert_sent:
                state.alert_sent = alert("Aktualności Meta: problem z synchronizacją", f"Źródło: {source}. {state.error}")
            db.commit()
    finally:
        db.close()


def sync_all():
    TOKEN_PATH.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with open(TOKEN_PATH.parent / "meta-news.lock", "a", encoding="utf-8") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        try:
            token = TOKEN_PATH.read_text(encoding="utf-8").strip()
        except (OSError, UnicodeError):
            token = ""
        for source in SOURCES:
            sync_source(source, token)
        check_token(token)


def check_token(token):
    db = SessionLocal()
    try:
        state = db.get(MetaNewsStatus, "token")
        if state is None:
            state = MetaNewsStatus(source="token", failures=0, alert_sent=False)
            db.add(state)
        now = datetime.now(timezone.utc)
        state.last_attempt_at = now.isoformat()
        try:
            if not token or not APP_SECRET_PATH.is_file():
                raise SyncError("Aby sprawdzać termin dostępu, zapisz token strony i App Secret.")
            secret = APP_SECRET_PATH.read_text(encoding="utf-8").strip()
            query = urlencode({"input_token": token})
            request = Request(f"{GRAPH}/debug_token?{query}", headers={"Authorization": f"Bearer {APP_ID}|{secret}"})
            with build_opener(NoRedirect).open(request, timeout=20) as response:
                payload = json.load(response)
            if not isinstance(payload, dict) or not isinstance(payload.get("data"), dict):
                raise SyncError("Meta zwróciła nieprawidłowy wynik kontroli tokenu.")
            result = payload["data"]
            if result.get("app_id") != APP_ID or result.get("type") != "PAGE" or not result.get("is_valid"):
                raise SyncError("Token jest nieprawidłowy lub nie należy do tej aplikacji.")
            if result.get("profile_id") and str(result["profile_id"]) != "1245985325257942":
                raise SyncError("Token dotyczy innej strony Facebooka.")
            def parse_time(value):
                if not isinstance(value, int) or value <= 0:
                    return None
                return datetime.fromtimestamp(value, timezone.utc)
            data_expiry = parse_time(result.get("data_access_expires_at"))
            token_expiry = parse_time(result.get("expires_at"))
            state.data_access_expires_at = data_expiry.isoformat() if data_expiry else None
            state.token_expires_at = token_expiry.isoformat() if token_expiry else None
            state.last_success_at = now.isoformat()
            if data_expiry is None:
                raise SyncError("Meta nie podała daty wygaśnięcia dostępu do danych.")
            deadlines = [date for date in (data_expiry, token_expiry) if date]
            if deadlines and (min(deadlines) - now).total_seconds() <= 14 * 86400:
                raise SyncError("Dostęp Meta wygasa w ciągu 14 dni lub już wygasł.")
            previous_alert = state.alert_sent
            state.error, state.failures, state.alert_sent = None, 0, False
            db.commit()
            if previous_alert:
                alert("Aktualności Meta: dostęp przywrócony", "Kontrola ważności tokenu nie wykazuje problemów.")
        except (SyncError, OSError, ValueError, TypeError, OverflowError, URLError) as exc:
            state.error = str(exc) if isinstance(exc, SyncError) else "Nie udało się sprawdzić ważności tokenu Meta."
            state.failures += 1
            if state.failures >= 2 and not state.alert_sent:
                state.alert_sent = alert("Aktualności Meta: kontrola dostępu", state.error)
            db.commit()
    finally:
        db.close()


async def sync_loop():
    while True:
        try:
            await asyncio.to_thread(sync_all)
        except Exception:
            # Do not log Meta response objects or request URLs.
            print("Meta news sync failed unexpectedly", flush=True)
        await asyncio.sleep(1800)


def build_meta_news_router(get_db, get_current_admin):
    router = APIRouter()

    @router.get("/meta-news")
    def list_news(page: int = 1, db=Depends(get_db)):
        if page < 1 or page > 100000:
            raise HTTPException(400, "Nieprawidłowa strona")
        rows = db.query(MetaNewsPost).order_by(MetaNewsPost.published_at.desc(), MetaNewsPost.id.desc()).offset((page - 1) * 30).limit(31).all()
        return {"posts": [{"id": row.id, "source": row.source, "text": row.text, "published_at": row.published_at,
                            "permalink": row.permalink, "media": json.loads(row.media_json)} for row in rows[:30]], "has_more": len(rows) > 30}

    @router.get("/admin/meta-news")
    def status(db=Depends(get_db), admin=Depends(get_current_admin)):
        states = {state.source: state for state in db.query(MetaNewsStatus).all()}
        token_state = states.get("token")
        return {"token_configured": TOKEN_PATH.is_file(), "app_secret_configured": APP_SECRET_PATH.is_file(),
            "token_status": {"error": token_state.error, "last_success_at": token_state.last_success_at,
                             "data_access_expires_at": token_state.data_access_expires_at,
                             "token_expires_at": token_state.token_expires_at} if token_state else None,
            "sources": [
            {"source": source, "last_attempt_at": states[source].last_attempt_at if source in states else None,
             "last_success_at": states[source].last_success_at if source in states else None,
             "error": states[source].error if source in states else None} for source in SOURCES]}

    @router.post("/admin/meta-news/token")
    async def save_token(request: FastAPIRequest, background: BackgroundTasks, admin=Depends(get_current_admin)):
        try:
            data = await request.json()
            if not isinstance(data, dict) or not isinstance(data.get("token"), str):
                raise ValueError()
            write_secret(data["token"])
        except (ValueError, UnicodeError):
            raise HTTPException(400, "Nieprawidłowy format tokenu") from None
        except OSError:
            raise HTTPException(500, "Nie udało się zapisać tokenu") from None
        background.add_task(sync_all)
        return {"saved": True}

    @router.post("/admin/meta-news/app-secret")
    async def save_app_secret(request: FastAPIRequest, background: BackgroundTasks, admin=Depends(get_current_admin)):
        try:
            data = await request.json()
            if not isinstance(data, dict) or not isinstance(data.get("secret"), str):
                raise ValueError()
            write_secret(data["secret"], APP_SECRET_PATH)
        except (ValueError, UnicodeError):
            raise HTTPException(400, "Nieprawidłowy format klucza") from None
        except OSError:
            raise HTTPException(500, "Nie udało się zapisać klucza") from None
        background.add_task(sync_all)
        return {"saved": True}

    @router.post("/admin/meta-news/sync")
    def start_sync(background: BackgroundTasks, admin=Depends(get_current_admin)):
        background.add_task(sync_all)
        return {"started": True}

    return router
