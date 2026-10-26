"""Autopay wire format. No credentials or untrusted XML are logged."""

import hashlib
import hmac
import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from xml.etree.ElementTree import Element, SubElement, tostring

from defusedxml.ElementTree import fromstring
from defusedxml.common import DefusedXmlException
from fastapi import HTTPException

ITN_FIELDS = (
    "orderID", "remoteID", "amount", "currency", "gatewayID", "paymentDate",
    "paymentStatus", "paymentStatusDetails", "addressIP", "customerNumber", "title", "customerData",
)
CUSTOMER_FIELDS = (
    "fName", "lName", "streetName", "streetHouseNo", "streetStaircaseNo", "streetPremiseNo",
    "postalCode", "city", "nrb", "senderData",
)


def payment_hash(values, config):
    payload = "|".join([str(value) for value in values if value not in (None, "")] + [config["key"]])
    return hashlib.new(config["algorithm"], payload.encode("utf-8")).hexdigest()


def signature_matches(signature, values, config):
    length = 64 if config["algorithm"] == "sha256" else 128
    return bool(isinstance(signature, str) and re.fullmatch(r"[0-9a-fA-F]{%d}" % length, signature)
                and hmac.compare_digest(payment_hash(values, config), signature.lower()))


def safe_xml(xml):
    if len(xml) > 65536:
        raise HTTPException(413, "Zbyt duży komunikat Autopay.")
    try:
        return fromstring(xml, forbid_dtd=True)
    except (DefusedXmlException, ValueError, SyntaxError):
        raise HTTPException(400, "Niepoprawny XML Autopay.") from None


def parse_transactions(xml, config, *, allow_batch=False):
    root = safe_xml(xml)
    if root.tag != "transactionList" or [node.tag for node in root] != ["serviceID", "transactions", "hash"]:
        raise HTTPException(400, "Nieobsługiwany format powiadomienia Autopay.")
    service = root.findtext("serviceID", "")
    transactions = list(root.find("transactions"))
    if not re.fullmatch(r"[0-9]{1,10}", service) or not (1 <= len(transactions) <= (50 if allow_batch else 1)):
        raise HTTPException(400, "Powiadomienie ITN musi zawierać dokładnie jedną transakcję.")
    values = [service]
    for transaction in transactions:
        tags = [node.tag for node in transaction]
        if (transaction.tag != "transaction" or len(tags) != len(set(tags))
                or tags != [field for field in ITN_FIELDS if field in tags]
                or any(len(node) for node in transaction if node.tag != "customerData")
                or not all(transaction.findtext(field) for field in
                           ("orderID", "remoteID", "amount", "currency", "paymentDate", "paymentStatus"))
                or not re.fullmatch(r"[A-Za-z0-9]{1,32}", transaction.findtext("orderID", ""))
                or not re.fullmatch(r"[A-Za-z0-9]{1,20}", transaction.findtext("remoteID", ""))):
            raise HTTPException(400, "Nieobsługiwane pola powiadomienia Autopay.")
        for node in transaction:
            if node.tag == "customerData":
                children = [child.tag for child in node]
                if (len(children) != len(set(children)) or children != [field for field in CUSTOMER_FIELDS if field in children]
                        or any(len(child) for child in node)):
                    raise HTTPException(400, "Nieobsługiwane pola customerData w ITN.")
                values.extend(child.text for child in node)
            else:
                values.append(node.text)
    authentic = service == config["service"] and signature_matches(root.findtext("hash", ""), values, config)
    return service, transactions, authentic


def confirmation_xml(service, confirmations, config):
    reply = Element("confirmationList")
    SubElement(reply, "serviceID").text = service
    items = SubElement(reply, "transactionsConfirmations")
    for order_id, confirmation in confirmations:
        item = SubElement(items, "transactionConfirmed")
        SubElement(item, "orderID").text = order_id
        SubElement(item, "confirmation").text = confirmation
    SubElement(reply, "hash").text = payment_hash([service] + [value for pair in confirmations for value in pair], config)
    return tostring(reply, encoding="utf-8", xml_declaration=True)


def provider_timezone(name):
    # Documentation specifies CET. Warsaw is an explicit alternative only if agreed with Autopay.
    return timezone(timedelta(hours=1), "CET") if name == "CET" else ZoneInfo("Europe/Warsaw")


def parse_payment_date(value, zone="Europe/Warsaw"):
    if not re.fullmatch(r"[0-9]{14}", value or ""):
        raise ValueError("Invalid provider timestamp")
    parsed = datetime.strptime(value, "%Y%m%d%H%M%S").replace(tzinfo=provider_timezone(zone))
    if not 2000 <= parsed.year <= 2100:
        raise ValueError("Invalid provider year")
    return parsed.astimezone(ZoneInfo("Europe/Warsaw"))
