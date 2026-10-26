"""Authenticated status/cancellation calls to fixed Autopay hosts; no automatic retries."""

from datetime import datetime, timezone
import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from uuid import uuid4

from fastapi import HTTPException

from autopay_protocol import parse_transactions, payment_hash, safe_xml, signature_matches
from premium_access import parse_premium_datetime


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def post_xml(config, path, fields, *, json_body=False):
    expected_host = "testpay.autopay.eu" if config.get("environment", "sandbox") == "sandbox" else "pay.autopay.eu"
    gateway = urlsplit(config["gateway"])
    if gateway.scheme != "https" or gateway.netloc != expected_host:
        raise HTTPException(503, "Nieprawidłowe środowisko Autopay.")
    request = Request(f"https://{expected_host}{path}", data=json.dumps(fields).encode() if json_body else urlencode(fields).encode("ascii"), method="POST",
                      headers={"Content-Type": "application/json" if json_body else "application/x-www-form-urlencoded", "BmHeader": "pay-bm"})
    try:
        with build_opener(NoRedirect()).open(request, timeout=10) as response:
            data = response.read(65537)
            if len(data) > 65536:
                raise ValueError
            return data
    except (HTTPError, URLError, OSError, ValueError):
        raise HTTPException(502, "Autopay nie potwierdził operacji. Status zamówienia i rezerwacja nie zostały zwolnione; spróbuj ponownie.") from None


def check_config(order, config):
    if order.environment != config.get("environment", "sandbox") or order.service_id != config["service"]:
        raise HTTPException(409, "Dane Autopay zmieniły się od utworzenia zamówienia. Przywróć właściwą konfigurację tego środowiska.")


def refresh_order(order, db, config):
    from premium_payments import process_itn
    check_config(order, config)
    last = parse_premium_datetime(order.last_status_check_at)
    if last and (datetime.now(timezone.utc) - last).total_seconds() < 15:
        raise HTTPException(429, "Odczekaj 15 sekund przed kolejnym sprawdzeniem w Autopay.")
    order.last_status_check_at = datetime.now(timezone.utc).isoformat()
    db.commit()
    fields = {"ServiceID": config["service"], "OrderID": order.id}
    fields["Hash"] = payment_hash(fields.values(), config)
    xml = post_xml(config, "/webapi/transactionStatus", fields)
    service, transactions, valid = parse_transactions(xml, config, allow_batch=True)
    if not valid or service != order.service_id or any(tx.findtext("orderID") != order.id for tx in transactions):
        raise HTTPException(502, "Nieprawidłowy podpis lub dane odpowiedzi Autopay. Zamówienie nie zostało zmienione.")
    process_itn(xml, db, config, allow_batch=True)


def cancel_unpaid_order(order, db, config):
    check_config(order, config)
    if order.status == "paid":
        raise HTTPException(409, "Opłacone zamówienie wymaga obsługi zwrotu, a nie anulowania płatności.")
    if order.provider_closed_at:
        return
    if not order.cancel_message_id:
        order.cancel_message_id = uuid4().hex
        db.commit()  # Persist the same identifier before any network call or retry.
    fields = {"ServiceID": config["service"], "MessageID": order.cancel_message_id, "OrderID": order.id}
    fields["Hash"] = payment_hash(fields.values(), config)
    xml = post_xml(config, "/webapi/transactionCancel", fields)
    root = safe_xml(xml)
    expected = ["serviceID", "messageID", "confirmation", "reason", "hash"]
    if root.tag != "transaction" or [node.tag for node in root] != expected or any(len(node) for node in root):
        raise HTTPException(502, "Niepoprawne potwierdzenie anulowania. Rezerwacja pozostaje zachowana.")
    values = [root.findtext(name) for name in expected[:-1]]
    if (root.findtext("serviceID") != order.service_id or root.findtext("messageID") != order.cancel_message_id
            or not signature_matches(root.findtext("hash"), values, config)):
        raise HTTPException(502, "Nieprawidłowy podpis anulowania. Rezerwacja pozostaje zachowana.")
    # The order may have become paid while the network request was in flight.
    from models import PremiumOrder
    order = db.query(PremiumOrder).filter_by(id=order.id).populate_existing().with_for_update().one()
    if root.findtext("confirmation") == "CONFIRMED" and root.findtext("reason") == "CANCELED_FULLY":
        order.provider_closed_at = datetime.now(timezone.utc).isoformat()
        if order.status != "paid":
            order.status = "cancelled"
        db.commit()
    else:
        db.rollback()
        raise HTTPException(409, "Autopay nie potwierdził pełnego anulowania. Sprawdź status płatności; rezerwacja pozostaje zachowana.")


def test_connection(config):
    if config.get("environment") != "sandbox":
        raise HTTPException(403, "Ten test łączy się wyłącznie ze środowiskiem sandbox.")
    fields = {"ServiceID": int(config["service"]), "MessageID": uuid4().hex, "Currencies": "PLN", "Language": "PL"}
    fields["Hash"] = payment_hash(fields.values(), config)
    try:
        result = json.loads(post_xml(config, "/gatewayList/v3", fields, json_body=True))
    except (ValueError, UnicodeError):
        raise HTTPException(502, "Autopay nie zwrócił poprawnej odpowiedzi testowej.") from None
    if isinstance(result, dict) and result.get("result") == "ERROR" and result.get("errorStatus") == "SERVICE_NOT_FOUND":
        raise HTTPException(502, "Autopay sandbox: SERVICE_NOT_FOUND. Operator nie rozpoznaje tego ID w środowisku testowym. Poproś Autopay o aktywowanie serwisu na testpay.autopay.eu i dostęp do portalu testowego.")
    # gatewayList/v3 intentionally has no response Hash; TLS authenticates the fixed host.
    if (not isinstance(result, dict) or result.get("result") != "OK" or str(result.get("serviceID")) != config["service"]
            or result.get("messageID") != fields["MessageID"] or not isinstance(result.get("gatewayList", []), list)):
        raise HTTPException(502, "Autopay nie potwierdził danych sandbox. Sprawdź ID, klucz, algorytm i aktywność testowego serwisu u operatora.")
    return {"message": "Połączenie z sandboxem działa. Pełny test wymaga jeszcze płatności testowej i odebrania ITN.",
            "available_channels": sum(1 for row in result.get("gatewayList", []) if isinstance(row, dict) and row.get("state") == "OK")}
