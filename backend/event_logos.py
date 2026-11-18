"""Materialize event logos as reproducible, content-addressed public assets.

The database retains the original data URI, so PostgreSQL backups remain the
source of truth and files can be regenerated after a restore.
"""
import base64
import binascii
import hashlib
import os
import tempfile
from io import BytesIO
from pathlib import Path

from PIL import Image, UnidentifiedImageError

MAX_LOGO_BYTES = 6 * 1024 * 1024
FORMATS = {"JPEG": ("image/jpeg", "jpg"), "PNG": ("image/png", "png"),
           "GIF": ("image/gif", "gif"), "WEBP": ("image/webp", "webp")}


def materialize_event_logo(value: str, directory: Path) -> str:
    if not value or not value.startswith("data:"):
        return value or ""
    try:
        header, encoded = value.split(",", 1)
        if len(encoded) > ((MAX_LOGO_BYTES + 2) // 3) * 4:
            raise ValueError("Logo exceeds size limit")
        if not header.endswith(";base64"):
            raise ValueError("Logo is not base64 encoded")
        content = base64.b64decode(encoded, validate=True)
        if not content or len(content) > MAX_LOGO_BYTES:
            raise ValueError("Logo exceeds size limit")
        with Image.open(BytesIO(content)) as image:
            mime, extension = FORMATS[image.format]
            if header != f"data:{mime};base64":
                raise ValueError("Logo type does not match its content")
            image.verify()
    except (ValueError, KeyError, binascii.Error, UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ValueError("Nieprawidłowy obraz logo; użyj JPEG, PNG, GIF lub WebP do 6 MiB") from exc

    name = f"{hashlib.sha256(content).hexdigest()}.{extension}"
    destination = directory / name
    if not destination.is_file():
        directory.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(dir=directory, prefix=".logo-")
        try:
            with os.fdopen(fd, "wb") as output:
                output.write(content)
            os.chmod(temporary, 0o644)
            os.replace(temporary, destination)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    return f"/api/uploads/event-logos/{name}"
