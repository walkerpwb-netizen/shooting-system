import smtplib
import ssl
import mimetypes
import re
from html import escape
from pathlib import Path
from email.message import EmailMessage
from email.utils import formataddr
from typing import Optional
from uuid import uuid4

from PIL import Image

from config import settings


EMAIL_ASSET_DIR = Path(__file__).resolve().parent / "uploads" / "email-assets"


ACTIVATION_LINK_PLACEHOLDER = "{{activation_link}}"
DEFAULT_ACTIVATION_EMAIL_SUBJECT = "Aktywacja konta w Systemie Strzeleckim"
DEFAULT_ACTIVATION_EMAIL_TEXT = (
    "Cześć,\n\n"
    "Dziękujemy za rejestrację w Systemie Strzeleckim. "
    "Aby aktywować konto, otwórz link:\n"
    f"{ACTIVATION_LINK_PLACEHOLDER}\n\n"
    "Jeśli to nie Ty zakładałeś konto, zignoruj tę wiadomość.\n"
)
DEFAULT_ACTIVATION_EMAIL_HTML = f"""
<p>Cześć,</p>
<p>Dziękujemy za rejestrację w Systemie Strzeleckim.</p>
<p><a href="{ACTIVATION_LINK_PLACEHOLDER}">Aktywuj konto</a></p>
<p>Jeśli to nie Ty zakładałeś konto, zignoruj tę wiadomość.</p>
""".strip()


def default_activation_email_template() -> dict[str, str]:
    return {
        "subject": DEFAULT_ACTIVATION_EMAIL_SUBJECT,
        "text_body": DEFAULT_ACTIVATION_EMAIL_TEXT,
        "html_body": DEFAULT_ACTIVATION_EMAIL_HTML,
    }


class MailConfigurationError(RuntimeError):
    pass


class MailDeliveryError(RuntimeError):
    pass


def is_mail_configured() -> bool:
    return bool(
        settings.smtp_host
        and settings.smtp_port
        and settings.smtp_username
        and settings.smtp_password
        and settings.smtp_from_email
    )


def _require_mail_config() -> None:
    if not is_mail_configured():
        raise MailConfigurationError(
            "SMTP is not configured. Set SMTP_HOST, SMTP_USERNAME, "
            "SMTP_PASSWORD, and SMTP_FROM_EMAIL."
        )


def _sender() -> str:
    if settings.smtp_from_name:
        return formataddr((settings.smtp_from_name, settings.smtp_from_email))

    return settings.smtp_from_email


def _fixed_email_image_width(tag: str, natural_width: int) -> str:
    style_match = re.search(r"\bstyle\s*=\s*([\"'])(.*?)\1", tag, re.IGNORECASE | re.DOTALL)
    style_value = style_match.group(2) if style_match else ""
    percentage_match = re.search(
        r"(?:^|;)\s*(?:max-)?width\s*:\s*(\d+(?:\.\d+)?)%",
        style_value,
        re.IGNORECASE,
    )

    if not percentage_match:
        width_match = re.search(
            r"\bwidth\s*=\s*([\"'])(\d+(?:\.\d+)?)%\1",
            tag,
            re.IGNORECASE,
        )
        percentage = float(width_match.group(2)) if width_match else None
    else:
        percentage = float(percentage_match.group(1))

    if percentage is None:
        return tag

    percentage = min(max(percentage, 1), 100)
    pixel_width = max(1, round(natural_width * percentage / 100))
    declarations = []

    for declaration in style_value.split(";"):
        declaration = declaration.strip()

        if not declaration or ":" not in declaration:
            continue

        property_name = declaration.split(":", 1)[0].strip().lower()

        if property_name not in {"width", "max-width"}:
            declarations.append(declaration)

    declarations.extend([
        f"width:{pixel_width}px",
        "max-width:100%",
    ])

    if not any(item.lower().startswith("height:") for item in declarations):
        declarations.append("height:auto")

    updated_style = ";".join(declarations) + ";"
    if style_match:
        start, end = style_match.span(2)
        tag = f"{tag[:start]}{updated_style}{tag[end:]}"
    else:
        tag = re.sub(
            r"\s*/?>$",
            f' style="{updated_style}">',
            tag,
        )

    tag = re.sub(
        r"\s+width\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+)",
        "",
        tag,
        flags=re.IGNORECASE,
    )
    tag = re.sub(r"\s*/?>$", f' width="{pixel_width}">', tag)

    return tag


def _embedded_email_assets(html_body: str) -> tuple[str, list[tuple[str, str, bytes]]]:
    asset_pattern = re.compile(
        rf"{re.escape(settings.frontend_url)}/api/uploads/email-assets/([A-Za-z0-9._-]+)"
    )
    embedded_assets: list[tuple[str, str, bytes]] = []
    replacements: dict[str, str] = {}
    asset_widths: dict[str, int] = {}

    def replace_asset(match: re.Match[str]) -> str:
        file_name = match.group(1)

        if file_name in replacements:
            return f"cid:{replacements[file_name]}"

        file_path = EMAIL_ASSET_DIR / file_name

        try:
            file_path.resolve().relative_to(EMAIL_ASSET_DIR.resolve())
        except ValueError:
            return match.group(0)

        if not file_path.is_file():
            return match.group(0)

        mime_type, _ = mimetypes.guess_type(file_name)

        if not mime_type or not mime_type.startswith("image/"):
            return match.group(0)

        cid = f"email-asset-{uuid4().hex}@system-strzelecki.pl"
        replacements[file_name] = cid
        embedded_assets.append((cid, mime_type.split("/", 1)[1], file_path.read_bytes()))
        with Image.open(file_path) as image:
            asset_widths[cid] = image.width
        return f"cid:{cid}"

    embedded_html = asset_pattern.sub(replace_asset, html_body)
    image_tag_pattern = re.compile(r"<img\b[^>]*>", re.IGNORECASE | re.DOTALL)

    def normalize_image_tag(match: re.Match[str]) -> str:
        tag = match.group(0)

        for cid, natural_width in asset_widths.items():
            if f"cid:{cid}" in tag:
                return _fixed_email_image_width(tag, natural_width)

        return tag

    return image_tag_pattern.sub(normalize_image_tag, embedded_html), embedded_assets


def send_email(
    to_email: str,
    subject: str,
    text_body: str,
    html_body: Optional[str] = None,
) -> None:
    _require_mail_config()

    message = EmailMessage()
    message["From"] = _sender()
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(text_body)

    if html_body:
        embedded_html, embedded_assets = _embedded_email_assets(html_body)
        message.add_alternative(embedded_html, subtype="html")
        html_part = message.get_payload()[-1]

        for cid, subtype, contents in embedded_assets:
            html_part.add_related(
                contents,
                maintype="image",
                subtype=subtype,
                cid=f"<{cid}>",
                disposition="inline",
            )

    context = ssl.create_default_context()

    try:
        if settings.smtp_use_tls and settings.smtp_port == 465:
            with smtplib.SMTP_SSL(
                settings.smtp_host,
                settings.smtp_port,
                context=context,
                timeout=20,
            ) as smtp:
                smtp.login(settings.smtp_username, settings.smtp_password)
                smtp.send_message(message)
            return

        with smtplib.SMTP(
            settings.smtp_host,
            settings.smtp_port,
            timeout=20,
        ) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls(context=context)
            smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(message)
    except smtplib.SMTPException as exc:
        raise MailDeliveryError(str(exc)) from exc
    except OSError as exc:
        raise MailDeliveryError(str(exc)) from exc


def send_activation_email(
    to_email: str,
    activation_link: str,
    template: Optional[dict[str, str]] = None,
) -> None:
    content = template or default_activation_email_template()
    subject = content.get("subject", DEFAULT_ACTIVATION_EMAIL_SUBJECT)
    text_body = content.get("text_body", DEFAULT_ACTIVATION_EMAIL_TEXT).replace(
        ACTIVATION_LINK_PLACEHOLDER,
        activation_link,
    )
    html_body = content.get("html_body", DEFAULT_ACTIVATION_EMAIL_HTML).replace(
        ACTIVATION_LINK_PLACEHOLDER,
        escape(activation_link, quote=True),
    )

    send_email(to_email, subject, text_body, html_body)


def send_password_reset_email(to_email: str, reset_link: str) -> None:
    subject = "Reset hasła w Systemie Strzeleckim"
    text_body = (
        "Cześć,\n\n"
        "Otrzymaliśmy prośbę o reset hasła. "
        "Aby ustawić nowe hasło, otwórz link:\n"
        f"{reset_link}\n\n"
        "Jeśli to nie Ty prosiłeś o reset, zignoruj tę wiadomość.\n"
    )
    html_body = f"""
    <p>Cześć,</p>
    <p>Otrzymaliśmy prośbę o reset hasła.</p>
    <p><a href=\"{reset_link}\">Ustaw nowe hasło</a></p>
    <p>Jeśli to nie Ty prosiłeś o reset, zignoruj tę wiadomość.</p>
    """

    send_email(to_email, subject, text_body, html_body)


def send_pzss_club_approved_email(
    to_email: str,
    club_name: str,
    license_number: str,
) -> None:
    login_url = f"{settings.frontend_url}/login"
    safe_club_name = club_name or "Twój klub"
    subject = "Konto klubu PZSS zostało zatwierdzone"
    text_body = (
        "Dzień dobry,\n\n"
        f"Konto klubu {safe_club_name} w Systemie Strzeleckim zostało zatwierdzone przez administratora.\n"
        "Możesz już zalogować się na swoje konto i korzystać z panelu organizatora:\n"
        f"{login_url}\n\n"
        f"Numer licencji klubowej PZSS: {license_number}\n\n"
        "Po zalogowaniu możesz przygotowywać zawody, publikować je i zarządzać zgłoszeniami.\n\n"
        "To wiadomość automatyczna. W razie pytań skontaktuj się z administratorem Systemu Strzeleckiego.\n\n"
        "Pozdrawiamy,\n"
        "System Strzelecki\n"
    )
    html_body = f"""
    <p>Dzień dobry,</p>
    <p>
      Konto klubu <strong>{escape(safe_club_name)}</strong> w Systemie Strzeleckim
      zostało zatwierdzone przez administratora.
    </p>
    <p>
      Możesz już zalogować się na swoje konto i korzystać z panelu organizatora:
      <br>
      <a href="{escape(login_url, quote=True)}">{escape(login_url)}</a>
    </p>
    <p>
      Numer licencji klubowej PZSS:
      <strong>{escape(license_number)}</strong>
    </p>
    <p>Po zalogowaniu możesz przygotowywać zawody, publikować je i zarządzać zgłoszeniami.</p>
    <p>
      To wiadomość automatyczna. W razie pytań skontaktuj się z administratorem
      Systemu Strzeleckiego.
    </p>
    <p>Pozdrawiamy,<br>System Strzelecki</p>
    """

    send_email(to_email, subject, text_body, html_body)
