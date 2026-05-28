import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from typing import Optional

from config import settings


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
        message.add_alternative(html_body, subtype="html")

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


def send_activation_email(to_email: str, activation_link: str) -> None:
    subject = "Aktywacja konta w Systemie Strzeleckim"
    text_body = (
        "Cześć,\n\n"
        "Dziękujemy za rejestrację w Systemie Strzeleckim. "
        "Aby aktywować konto, otwórz link:\n"
        f"{activation_link}\n\n"
        "Jeśli to nie Ty zakładałeś konto, zignoruj tę wiadomość.\n"
    )
    html_body = f"""
    <p>Cześć,</p>
    <p>Dziękujemy za rejestrację w Systemie Strzeleckim.</p>
    <p><a href=\"{activation_link}\">Aktywuj konto</a></p>
    <p>Jeśli to nie Ty zakładałeś konto, zignoruj tę wiadomość.</p>
    """

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
