"""Private Autopay receipt ledger and cash-receipt reports. No manual entries."""

import csv
import re
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from io import BytesIO, StringIO
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from openpyxl import Workbook
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
from openpyxl.styles import Alignment, Font, PatternFill
from sqlalchemy import extract, func, or_

from models import AutopayReceipt, User

WARSAW = ZoneInfo("Europe/Warsaw")
TAX_SOURCE = "https://podatki.gov.pl/podatki-osobiste/pit/informacje-podstawowe/co-jest-opodatkowane/dochody-z-dzialalnosci-nierejestrowanej"
REPORT_NOTE = (
    "Zestawienie pomocnicze do PIT-36: tylko potwierdzone wpłaty klientów przez Autopay w tym systemie. "
    "Kwoty przed potrąceniem prowizji; koszty i zwroty nie są uwzględnione. "
    "Uzgodnij z dokumentami operatora. Raport nie jest deklaracją ani wyliczeniem podatku "
    "i nie służy do ustalania limitu przychodów należnych działalności nierejestrowanej."
)
MONTHS = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"]
HEADERS = ["Data wpłaty (Polska)", "Płatnik", "E-mail konta", "Usługa", "Kwota klienta [PLN]", "ID transakcji Autopay", "ID serwisu", "Numer zamówienia", "Data rejestracji w systemie (UTC)"]


def money(grosz):
    return f"{Decimal(int(grosz or 0)) / 100:.2f}"


def receipt_description(package, period):
    if package == "organizer":
        return "Roczny Organizator + Premium Strzelca" if period == "yearly" else "Jednorazowa dodatkowa publikacja"
    return "Premium Strzelca — rok" if period == "yearly" else "Premium Strzelca — miesiąc"


def record_autopay_receipt(order, transaction, db):
    """Called only after ITN signature, service, order, currency and amount validation."""
    remote_id = transaction.findtext("remoteID", "")
    payment_date = transaction.findtext("paymentDate", "")
    if not re.fullmatch(r"[A-Za-z0-9]{1,20}", remote_id) or not re.fullmatch(r"[0-9]{14}", payment_date):
        raise HTTPException(400, "Niepoprawny identyfikator lub data wpłaty Autopay.")
    try:
        paid_at = datetime.strptime(payment_date, "%Y%m%d%H%M%S").replace(tzinfo=WARSAW)
        if not 2000 <= paid_at.year <= 2100:
            raise ValueError
        amount = Decimal(transaction.findtext("amount", ""))
        if not amount.is_finite() or amount <= 0 or amount != amount.quantize(Decimal("0.01")):
            raise InvalidOperation
        grosz = int(amount * 100)
        if grosz > 99999999:
            raise InvalidOperation
    except (ValueError, InvalidOperation):
        raise HTTPException(400, "Niepoprawna data lub kwota wpłaty Autopay.")
    existing = db.query(AutopayReceipt).filter_by(
        environment=order.environment, service_id=order.service_id, remote_id=remote_id,
    ).first()
    if existing:
        if (existing.order_reference != order.id or existing.amount_grosz != grosz
                or existing.currency != order.currency or existing.provider_payment_date != payment_date):
            raise HTTPException(409, "Transakcja Autopay jest już zapisana z innymi danymi.")
        return existing
    payer = db.get(User, order.user_id) if order.user_id is not None else None
    entry = AutopayReceipt(
        order_id=order.id, order_reference=order.id, service_id=order.service_id,
        remote_id=remote_id, environment=order.environment, amount_grosz=grosz, currency=order.currency,
        paid_on=paid_at.date(), paid_at=paid_at.isoformat(), provider_payment_date=payment_date,
        recorded_at=datetime.now(timezone.utc).isoformat(), package=order.package, period=order.period,
        payer_name=" ".join(filter(None, [payer.first_name, payer.last_name]))[:255] if payer else "",
        payer_email=(payer.email or "")[:255] if payer else "",
    )
    db.add(entry)
    db.flush()
    return entry


def receipt_query(db, environment):
    return db.query(AutopayReceipt).filter(AutopayReceipt.environment == environment, AutopayReceipt.currency == "PLN")


def year_query(query, year):
    return query.filter(AutopayReceipt.paid_on >= date(year, 1, 1), AutopayReceipt.paid_on < date(year + 1, 1, 1))


def totals(query):
    count, amount = query.with_entities(func.count(AutopayReceipt.id), func.coalesce(func.sum(AutopayReceipt.amount_grosz), 0)).one()
    return {"count": count, "amount": money(amount)}


def monthly_totals(query):
    month = extract("month", AutopayReceipt.paid_on)
    groups = query.with_entities(month, func.count(AutopayReceipt.id), func.sum(AutopayReceipt.amount_grosz)).group_by(month).all()
    grouped = {int(number): (count, amount) for number, count, amount in groups}
    return [{"month": number, "label": label, "count": grouped.get(number, (0, 0))[0],
             "amount": money(grouped.get(number, (0, 0))[1])} for number, label in enumerate(MONTHS, 1)]


def monthly_receipts(entries):
    # A downloaded report uses one immutable query result for every worksheet.
    # New ITNs arriving during export cannot change only its monthly totals.
    rows = [{"month": number, "label": label, "count": 0, "grosz": 0} for number, label in enumerate(MONTHS, 1)]
    for entry in entries:
        row = rows[entry.paid_on.month - 1]
        row["count"] += 1
        row["grosz"] += entry.amount_grosz
    return [{"month": row["month"], "label": row["label"], "count": row["count"], "amount": money(row["grosz"])} for row in rows]


def serialize_receipt(entry):
    return {
        "id": entry.id, "paid_on": entry.paid_on.isoformat(), "paid_at": entry.paid_at,
        "recorded_at": entry.recorded_at, "payer_name": entry.payer_name, "payer_email": entry.payer_email,
        "description": receipt_description(entry.package, entry.period), "amount": money(entry.amount_grosz),
        "currency": entry.currency, "remote_id": entry.remote_id, "service_id": entry.service_id,
        "order_reference": entry.order_reference, "environment": entry.environment,
    }


def payment_overview(db, year, environment, month=None, search="", page=1, page_size=50):
    all_receipts = receipt_query(db, environment)
    annual = year_query(all_receipts, year)
    matching = annual
    if month is not None:
        matching = matching.filter(extract("month", AutopayReceipt.paid_on) == month)
    if search.strip():
        escaped = search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        matching = matching.filter(or_(*[
            field.ilike(f"%{escaped}%", escape="\\") for field in (
                AutopayReceipt.payer_name, AutopayReceipt.payer_email,
                AutopayReceipt.remote_id, AutopayReceipt.order_reference,
            )
        ]))
    matching_totals = totals(matching)
    rows = matching.order_by(AutopayReceipt.paid_on.desc(), AutopayReceipt.paid_at.desc(), AutopayReceipt.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    years = [int(row[0]) for row in all_receipts.with_entities(extract("year", AutopayReceipt.paid_on)).distinct().all()]
    return {
        "year": year, "environment": environment, "page": page, "page_size": page_size,
        "years": sorted(set(years + [datetime.now(WARSAW).year]), reverse=True),
        "annual": totals(annual), "lifetime": totals(all_receipts), "matching": matching_totals,
        "months": monthly_totals(annual), "entries": [serialize_receipt(row) for row in rows],
        "report_note": REPORT_NOTE, "tax_source_url": TAX_SOURCE,
    }


def export_row(entry):
    return [entry.paid_at, entry.payer_name, entry.payer_email, receipt_description(entry.package, entry.period),
            money(entry.amount_grosz), entry.remote_id, entry.service_id, entry.order_reference, entry.recorded_at]


def csv_text(value):
    text = str(value)
    return "'" + text if text.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")) else text


def build_payments_csv(entries, year):
    output = StringIO(newline="")
    writer = csv.writer(output, delimiter=";")
    writer.writerow(HEADERS)
    for entry in entries:
        row = export_row(entry)
        row[4] = row[4].replace(".", ",")
        writer.writerow([csv_text(value) for value in row])
    writer.writerow([f"SUMA WPŁAT {year}", "", "", "", money(sum(e.amount_grosz for e in entries)).replace(".", ","), "", "", "", ""])
    writer.writerow([REPORT_NOTE])
    return output.getvalue().encode("utf-8-sig")


def write_excel_row(sheet, values):
    sheet.append(values)
    for cell in sheet[sheet.max_row]:
        if isinstance(cell.value, str):
            cell.value = ILLEGAL_CHARACTERS_RE.sub("", cell.value)
            cell.data_type = "s"


def build_payments_workbook(entries, year, months, seller):
    workbook = Workbook()
    summary = workbook.active
    summary.title = "Podsumowanie"
    for row in [
        ["Roczne zestawienie rzeczywistych wpłat Autopay — pomocniczo do PIT-36"],
        ["Rok", year], ["Sprzedawca", seller.get("name", "")], ["Adres", seller.get("address", "")],
        ["Wygenerowano (Polska)", datetime.now(WARSAW).isoformat()],
        ["Liczba potwierdzonych wpłat", len(entries)],
        ["Suma wpłat klientów [PLN], przed prowizjami i zwrotami", float(Decimal(sum(e.amount_grosz for e in entries)) / 100)],
        ["Prowizje / inne koszty", "Nie uwzględniono"], ["Zwroty klientom", "Nie uwzględniono"],
        ["Zakres raportu", REPORT_NOTE], ["Zasady PIT-36 — Ministerstwo Finansów", TAX_SOURCE],
    ]:
        write_excel_row(summary, row)
    summary["B7"].number_format = '#,##0.00 "zł"'
    summary.column_dimensions["A"].width = 65
    summary.column_dimensions["B"].width = 100
    summary["B10"].alignment = Alignment(wrap_text=True)
    summary.row_dimensions[10].height = 65
    monthly = workbook.create_sheet("Miesiące")
    write_excel_row(monthly, ["Miesiąc", "Liczba wpłat", "Suma wpłat [PLN]"])
    for month in months:
        write_excel_row(monthly, [month["label"], month["count"], float(Decimal(month["amount"]))])
        monthly.cell(monthly.max_row, 3).number_format = '#,##0.00 "zł"'
    monthly.column_dimensions["A"].width = 22
    monthly.column_dimensions["B"].width = 20
    monthly.column_dimensions["C"].width = 25
    detail = workbook.create_sheet("Wpłaty")
    write_excel_row(detail, HEADERS)
    for entry in entries:
        row = export_row(entry)
        row[4] = float(Decimal(row[4]))
        write_excel_row(detail, row)
        detail.cell(detail.max_row, 5).number_format = '#,##0.00 "zł"'
    for column, width in zip("ABCDEFGHI", [30, 28, 35, 45, 22, 25, 15, 36, 35]):
        detail.column_dimensions[column].width = width
    for sheet in workbook:
        sheet.freeze_panes = "A2"
        if sheet != summary:
            sheet.auto_filter.ref = sheet.dimensions
        for cell in sheet[1]:
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = PatternFill("solid", fgColor="14532D")
    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


def build_payments_router(get_db, get_current_admin, seller_details):
    router = APIRouter(prefix="/admin/payments", tags=["Wpłaty Autopay"])

    @router.get("")
    def overview(
        response: Response, year: int | None = Query(default=None, ge=2000, le=2100),
        environment: Literal["production", "sandbox"] = "production",
        month: int | None = Query(default=None, ge=1, le=12),
        search: str = Query(default="", max_length=100), page: int = Query(default=1, ge=1),
        page_size: int = Query(default=50, ge=1, le=100),
        admin=Depends(get_current_admin), db=Depends(get_db),
    ):
        response.headers["Cache-Control"] = "no-store"
        return payment_overview(db, year or datetime.now(WARSAW).year, environment, month, search, page, page_size)

    @router.get("/report")
    def annual_report(
        year: int = Query(ge=2000, le=2100), format: Literal["xlsx", "csv"] = "xlsx",
        environment: Literal["production"] = "production",
        admin=Depends(get_current_admin), db=Depends(get_db),
    ):
        query = year_query(receipt_query(db, environment), year)
        entries = query.order_by(AutopayReceipt.paid_on, AutopayReceipt.paid_at, AutopayReceipt.id).all()
        if format == "csv":
            content = build_payments_csv(entries, year)
            media_type = "text/csv; charset=utf-8"
        else:
            content = build_payments_workbook(entries, year, monthly_receipts(entries), seller_details())
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        return Response(content, media_type=media_type, headers={
            "Content-Disposition": f'attachment; filename="autopay-wplaty-{year}.{format}"',
            "Cache-Control": "no-store",
        })

    return router
