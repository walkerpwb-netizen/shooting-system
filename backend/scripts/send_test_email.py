import argparse
from pathlib import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from mailer import send_email


def main() -> None:
    parser = argparse.ArgumentParser(description="Send a test email using configured SMTP settings.")
    parser.add_argument("recipient", help="Recipient email address")
    args = parser.parse_args()

    send_email(
        to_email=args.recipient,
        subject="Test Systemu Strzeleckiego",
        text_body=(
            "To jest testowa wiadomość z Systemu Strzeleckiego.\n\n"
            "Jeśli ją widzisz, konfiguracja SMTP działa poprawnie.\n"
        ),
        html_body=(
            "<p>To jest testowa wiadomość z Systemu Strzeleckiego.</p>"
            "<p>Jeśli ją widzisz, konfiguracja SMTP działa poprawnie.</p>"
        ),
    )
    print("Test email sent")


if __name__ == "__main__":
    main()
