"""One-time removal of retired manual home posts and their uploaded images."""
import json
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from database import SessionLocal  # noqa: E402
from models import HomePost  # noqa: E402

IMAGES = BACKEND / "uploads" / "home-posts"
MANIFEST = BACKEND / ".private" / "legacy-home-post-removal.json"
PREFIX = "/uploads/home-posts/"


def filename(url):
    if not url or not url.startswith(PREFIX):
        raise ValueError("Wpis wskazuje plik poza katalogiem ręcznych aktualności")
    name = url[len(PREFIX):]
    if not name or name in {".", ".."} or Path(name).name != name:
        raise ValueError("Nieprawidłowa nazwa pliku starej aktualności")
    return name


def main():
    MANIFEST.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    pending = set(json.loads(MANIFEST.read_text(encoding="utf-8"))) if MANIFEST.exists() else set()
    db = SessionLocal()
    try:
        posts = db.query(HomePost).all()
        pending.update(filename(post.image_url) for post in posts)
        for name in pending:
            filename(PREFIX + name)
        fd = os.open(MANIFEST, os.O_CREAT | os.O_TRUNC | os.O_WRONLY, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as file:
            json.dump(sorted(pending), file)
            file.flush()
            os.fsync(file.fileno())
        for post in posts:
            db.delete(post)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    for name in pending:
        (IMAGES / name).unlink(missing_ok=True)
    MANIFEST.unlink(missing_ok=True)
    print(f"Usunięto wpisy: {len(posts)}, zweryfikowano pliki: {len(pending)}")


if __name__ == "__main__":
    main()
