"""Normalize Meta news without handling credentials or making network requests."""

import re
from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlsplit


NEWS_TAG = re.compile(r"(?<![\w#])#news(?!\w)", re.IGNORECASE)


def is_news(text):
    return bool(NEWS_TAG.search(text or ""))


def display_text(text):
    return NEWS_TAG.sub("", text or "").strip()


def safe_url(value):
    if not isinstance(value, str) or not value:
        return None
    try:
        parts = urlsplit(value)
    except ValueError:
        return None
    if (parts.scheme != "https" or not parts.hostname or parts.username or parts.password
            or any(key.casefold() in {"access_token", "appsecret_proof"} for key, _ in parse_qsl(parts.query, keep_blank_values=True))):
        return None
    return value


def published_at(value):
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return None
        return parsed.astimezone(timezone.utc).isoformat()
    except (AttributeError, TypeError, ValueError):
        return None


def facebook_media(attachments):
    result = []
    for item in attachments.get("data", []):
        children = item.get("subattachments", {}).get("data", [])
        for media in children or [item]:
            image = safe_url(((media.get("media") or {}).get("image") or {}).get("src"))
            if image:
                result.append({"url": image, "type": "video" if "video" in (media.get("type") or "") else "image"})
    return result


def instagram_media(post):
    result = []
    for item in post.get("children", {}).get("data", []) or [post]:
        kind = item.get("media_type")
        url = safe_url(item.get("thumbnail_url") if kind == "VIDEO" else item.get("media_url"))
        if url:
            result.append({"url": url, "type": "video" if kind == "VIDEO" else "image"})
    return result


def normalize_post(source, post):
    if source == "facebook":
        text = post.get("message") or ""
        when = post.get("created_time")
        link = post.get("permalink_url")
        media = facebook_media(post.get("attachments") or {})
    elif source == "instagram":
        text = post.get("caption") or ""
        when = post.get("timestamp")
        link = post.get("permalink")
        media = instagram_media(post)
    else:
        raise ValueError("unknown source")
    if not is_news(text):
        return None
    post_id = post.get("id")
    when = published_at(when)
    link = safe_url(link)
    if not isinstance(post_id, str) or not post_id or not when or not link:
        raise ValueError("incomplete news post")
    return {"source": source, "source_id": post_id, "text": display_text(text),
            "published_at": when, "permalink": link, "media": media}
