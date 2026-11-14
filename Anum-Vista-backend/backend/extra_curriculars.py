"""extra_curriculars.py — Extra Curriculars (Community Hall, Advert 1-4, Others) & Excel historical seed."""
from datetime import datetime
from decimal import Decimal
import re
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

try:
    from backend import models, schemas
    from backend.database import get_db
    from backend.auth import require_admin, require_super_admin
    from backend.approval_endpoints import TREASURER_HOLDERS, _audit, _notify, _apply_treasury_effect
except ImportError:
    import models, schemas
    from database import get_db
    from auth import require_admin, require_super_admin
    from approval_endpoints import TREASURER_HOLDERS, _audit, _notify, _apply_treasury_effect

ec_router = APIRouter()

DEFAULT_SOURCES = [
    {
        "code": "community_hall",
        "name": "Community Hall",
        "source_type": "community_hall",
        "billing_cycle": "one_time",
        "annual_fixed_amount": Decimal("0.00"),
    },
    {
        "code": "advert_1",
        "name": "Advert 1 - Asif (Side A)",
        "source_type": "advert",
        "billing_cycle": "quarterly",
        "annual_fixed_amount": Decimal("8000000.00"),
    },
    {
        "code": "advert_2",
        "name": "Advert 2 - Raza (Side B)",
        "source_type": "advert",
        "billing_cycle": "half_yearly",
        "annual_fixed_amount": Decimal("600000.00"),
    },
    {
        "code": "advert_3",
        "name": "Advert 3 - Shehryar (Top C)",
        "source_type": "advert",
        "billing_cycle": "quarterly",
        "annual_fixed_amount": Decimal("1600000.00"),
    },
    {
        "code": "advert_4",
        "name": "Advert 4",
        "source_type": "advert",
        "billing_cycle": "yearly",
        "annual_fixed_amount": Decimal("0.00"),
    },
    {
        "code": "other_scrap_sale",
        "name": "Scrap Sale / AC",
        "source_type": "other",
        "billing_cycle": "one_time",
        "annual_fixed_amount": Decimal("0.00"),
    },
    {
        "code": "other_shop_maint_a",
        "name": "Shop Maintenance (A)",
        "source_type": "other",
        "billing_cycle": "one_time",
        "annual_fixed_amount": Decimal("0.00"),
    },
    {
        "code": "other_ad_utility_bill",
        "name": "Advertisement Utility Bill Collection",
        "source_type": "other",
        "billing_cycle": "one_time",
        "annual_fixed_amount": Decimal("0.00"),
    },
]

# Exact verified extra curricular entries extracted from Anum_Vista_-_Sep_2026.xlsx (Recpt 2025 & Recpt 2026)
# Format: (ref_key, source_code, month_iso, amount, receipt_note, date_note, collector)
EXCEL_EXTRA_CURRICULAR_ENTRIES = [
    # --- Recpt 2026 (Jan - Sep 2026) ---
    ("EXCEL-EC-2026-SHOPA-05", "other_shop_maint_a", "2026-05-15", "60000.00", "355", "May 2026", None),
    ("EXCEL-EC-2026-CHALL-05", "community_hall", "2026-05-28", "8000.00", "368", "May 2026", None),
    ("EXCEL-EC-2026-CHALL-06", "community_hall", "2026-06-26", "8000.00", "401", "Jun 2026", None),
    ("EXCEL-EC-2026-ADV1-01", "advert_1", "2026-01-20", "500000.00", "", "Jan 2026 (Q1)", "Dilshad"),
    ("EXCEL-EC-2026-ADV1-02", "advert_1", "2026-02-17", "500000.00", "", "Feb 2026 (Q1)", "Dilshad"),
    ("EXCEL-EC-2026-ADV1-03", "advert_1", "2026-03-16", "1000000.00", "02,16 Mar", "Mar 2026 (Q1)", "Dilshad"),
    ("EXCEL-EC-2026-ADV1-05", "advert_1", "2026-05-19", "600000.00", "", "May 2026 (Q2)", "Dilshad"),
    ("EXCEL-EC-2026-ADV1-06", "advert_1", "2026-06-10", "700000.00", "", "Jun 2026 (Q2)", "Dilshad"),
    ("EXCEL-EC-2026-ADV1-07", "advert_1", "2026-07-28", "1100000.00", "13, 28 Jul", "Jul 2026 (Q3)", "Dilshad"),
    ("EXCEL-EC-2026-ADV1-08", "advert_1", "2026-08-25", "982000.00", "15, 18, 25 Aug 2026", "Aug 2026 (Q3)", None),
    ("EXCEL-EC-2026-ADV1-09", "advert_1", "2026-09-23", "600000.00", "", "Sep 2026 (Q3)", None),
    ("EXCEL-EC-2026-ADV2-04", "advert_2", "2026-04-09", "300000.00", "Rec. by Dilshad", "H1 2026", "Dilshad"),
    ("EXCEL-EC-2026-ADV2-09", "advert_2", "2026-09-24", "330000.00", "", "H2 2026", None),
    ("EXCEL-EC-2026-ADV3-02", "advert_3", "2026-02-16", "200000.00", "", "Feb 2026 (Q1)", None),
    ("EXCEL-EC-2026-ADV3-03", "advert_3", "2026-03-16", "200000.00", "", "Mar 2026 (Q1)", None),
    ("EXCEL-EC-2026-ADV3-05", "advert_3", "2026-05-20", "133500.00", "", "May 2026 (Q2)", "Dilshad"),
    ("EXCEL-EC-2026-ADV3-06", "advert_3", "2026-06-18", "200000.00", "", "Jun 2026 (Q2)", "Dilshad"),
    ("EXCEL-EC-2026-ADV3-07", "advert_3", "2026-07-31", "180000.00", "", "Jul 2026 (Q3)", None),
    ("EXCEL-EC-2026-ADV3-08", "advert_3", "2026-08-26", "133500.00", "", "Aug 2026 (Q3)", None),
    ("EXCEL-EC-2026-ADV3-09", "advert_3", "2026-09-17", "135000.00", "", "Sep 2026 (Q3)", None),
    ("EXCEL-EC-2026-SCRAP-01", "other_scrap_sale", "2026-01-31", "27500.00", "", "Jan 2026", None),
    ("EXCEL-EC-2026-SCRAP-05", "other_scrap_sale", "2026-05-20", "5000.00", "", "May 2026", None),
    ("EXCEL-EC-2026-SCRAP-06", "other_scrap_sale", "2026-06-18", "4000.00", "", "Jun 2026", None),
    ("EXCEL-EC-2026-ADUTIL-01", "other_ad_utility_bill", "2026-01-15", "50000.00", "", "Jan 2026", None),
    ("EXCEL-EC-2026-ADUTIL-05", "other_ad_utility_bill", "2026-05-01", "-50000.00", "Adjustment", "May 2026", None),
    # --- Recpt 2025 (2023 - 2025) ---
    ("EXCEL-EC-2023-SHOPA-02", "other_shop_maint_a", "2023-02-12", "7500.00", "1323", "Feb 2023", None),
    ("EXCEL-EC-2023-SHOPA-04", "other_shop_maint_a", "2023-04-12", "15000.00", "1388", "Apr 2023", None),
    ("EXCEL-EC-2023-SHOPA-07", "other_shop_maint_a", "2023-07-08", "15000.00", "1454", "Jul 2023", None),
    ("EXCEL-EC-2023-SHOPA-08", "other_shop_maint_a", "2023-08-11", "15000.00", "1488", "Aug 2023", None),
    ("EXCEL-EC-2023-SHOPA-09", "other_shop_maint_a", "2023-09-13", "7500.00", "1518", "Sep 2023", None),
    ("EXCEL-EC-2023-SHOPA-11", "other_shop_maint_a", "2023-11-17", "15000.00", "1563", "Nov 2023", None),
    ("EXCEL-EC-2024-SHOPA-01", "other_shop_maint_a", "2024-01-03", "15000.00", "1596", "Jan 2024", None),
    ("EXCEL-EC-2024-SHOPA-02", "other_shop_maint_a", "2024-02-20", "15000.00", "1629", "Feb 2024", None),
    ("EXCEL-EC-2024-SHOPA-06", "other_shop_maint_a", "2024-06-10", "30000.00", "1741/1744", "Jun 2024", None),
    ("EXCEL-EC-2024-SHOPA-11", "other_shop_maint_a", "2024-11-09", "15000.00", "1864", "Nov 2024", None),
    ("EXCEL-EC-2025-SHOPA-08", "other_shop_maint_a", "2025-08-31", "90000.00", "105", "Aug 2025", None),
    ("EXCEL-EC-2025-SHOPA-11", "other_shop_maint_a", "2025-11-22", "7500.00", "0196", "Nov 2025", None),
    ("EXCEL-EC-2023-CHALL-02", "community_hall", "2023-02-03", "4000.00", "1339", "Feb 2023", None),
    ("EXCEL-EC-2023-CHALL-03", "community_hall", "2023-03-19", "4000.00", "1358", "Mar 2023", None),
    ("EXCEL-EC-2023-CHALL-04", "community_hall", "2023-04-04", "4000.00", "1369", "Apr 2023", None),
    ("EXCEL-EC-2023-CHALL-05", "community_hall", "2023-05-14", "4000.00", "1415", "May 2023", None),
    ("EXCEL-EC-2023-CHALL-12", "community_hall", "2023-12-22", "4000.00", "1587", "Dec 2023", None),
    ("EXCEL-EC-2024-CHALL-12", "community_hall", "2024-12-30", "8000.00", "1905/1907", "Dec 2024", None),
    ("EXCEL-EC-2025-CHALL-05", "community_hall", "2025-05-12", "8000.00", "021", "May 2025", None),
    ("EXCEL-EC-2025-CHALL-06", "community_hall", "2025-07-15", "4000.00", "069", "Jun 2025", None),
    ("EXCEL-EC-2025-CHALL-07", "community_hall", "2025-07-27", "8000.00", "064", "Jul 2025", None),
    ("EXCEL-EC-2025-CHALL-10", "community_hall", "2025-10-27", "4000.00", "171", "Oct 2025", None),
    ("EXCEL-EC-2025-CHALL-12", "community_hall", "2025-12-16", "8000.00", "212", "Dec 2025", None),
    ("EXCEL-EC-2023-ADV1-01", "advert_1", "2023-01-31", "500000.00", "", "Jan 2023", None),
    ("EXCEL-EC-2023-ADV1-02", "advert_1", "2023-02-28", "500000.00", "", "Feb 2023", None),
    ("EXCEL-EC-2023-ADV1-03", "advert_1", "2023-03-31", "625000.00", "", "Mar 2023", None),
    ("EXCEL-EC-2023-ADV1-04", "advert_1", "2023-04-01", "1625000.00", "", "Q2 2023", None),
    ("EXCEL-EC-2023-ADV1-07", "advert_1", "2023-07-01", "1625000.00", "", "Q3 2023", None),
    ("EXCEL-EC-2023-ADV1-10", "advert_1", "2023-10-01", "1625000.00", "", "Q4 2023", None),
    ("EXCEL-EC-2024-ADV1-01", "advert_1", "2024-01-01", "1706250.00", "", "Q1 2024", None),
    ("EXCEL-EC-2024-ADV1-04", "advert_1", "2024-04-01", "1791562.50", "", "Q2 2024", None),
    ("EXCEL-EC-2024-ADV1-07", "advert_1", "2024-07-01", "1791563.00", "", "Q3 2024", None),
    ("EXCEL-EC-2024-ADV1-10", "advert_1", "2024-10-01", "1791563.00", "", "Q4 2024", None),
    ("EXCEL-EC-2025-ADV1-01", "advert_1", "2025-01-01", "1791563.00", "", "Q1 2025", None),
    ("EXCEL-EC-2025-ADV1-05", "advert_1", "2025-05-01", "1791562.63", "Received Short amount", "Q2 2025", None),
    ("EXCEL-EC-2025-ADV1-08", "advert_1", "2025-08-01", "1881000.00", "", "Q3 2025", None),
    ("EXCEL-EC-2025-ADV1-09", "advert_1", "2025-09-24", "600000.00", "Rec. Asif", "Sep 2025", "Asif"),
    ("EXCEL-EC-2025-ADV1-10", "advert_1", "2025-10-21", "500000.00", "Rec. Dilshad", "Oct 2025", "Dilshad"),
    ("EXCEL-EC-2025-ADV1-11", "advert_1", "2025-11-20", "870000.00", "Rec. Dilshad", "Nov/Dec 2025", "Dilshad"),
    ("EXCEL-EC-2025-ADV1-12", "advert_1", "2025-12-19", "500000.00", "Rec. Dilshad", "Dec 2025", "Dilshad"),
    ("EXCEL-EC-2023-ADV2-01", "advert_2", "2023-01-31", "400000.00", "", "H1 2023", None),
    ("EXCEL-EC-2023-ADV2-05", "advert_2", "2023-05-01", "400000.00", "", "May 2023", None),
    ("EXCEL-EC-2023-ADV2-10", "advert_2", "2023-10-01", "400000.00", "", "Oct 2023", None),
    ("EXCEL-EC-2025-ADV2-03", "advert_2", "2025-03-01", "100000.00", "2 Adds Adhoc", "Mar 2025", None),
    ("EXCEL-EC-2025-ADV2-09", "advert_2", "2025-09-01", "300000.00", "", "Sep 2025", None),
    ("EXCEL-EC-2023-ADV3-01", "advert_3", "2023-01-31", "300000.00", "", "Q1 2023", None),
    ("EXCEL-EC-2023-ADV3-04", "advert_3", "2023-04-30", "300000.00", "", "Q2 2023", None),
    ("EXCEL-EC-2023-ADV3-07", "advert_3", "2023-07-08", "300000.00", "", "Q3 2023", None),
    ("EXCEL-EC-2023-ADV3-10", "advert_3", "2023-10-31", "300000.00", "", "Q4 2023", None),
    ("EXCEL-EC-2024-ADV3-01", "advert_3", "2024-01-31", "300000.00", "", "Q1 2024", None),
    ("EXCEL-EC-2024-ADV3-04", "advert_3", "2024-04-30", "300000.00", "", "Q2 2024", None),
    ("EXCEL-EC-2024-ADV3-07", "advert_3", "2024-07-31", "300000.00", "", "Q3 2024", None),
    ("EXCEL-EC-2024-ADV3-10", "advert_3", "2024-10-31", "300000.00", "", "Q4 2024", None),
    ("EXCEL-EC-2025-ADV3-01", "advert_3", "2025-01-31", "300000.00", "", "Q1 2025", None),
    ("EXCEL-EC-2025-ADV3-04", "advert_3", "2025-04-30", "300000.00", "", "Q2 2025", None),
    ("EXCEL-EC-2025-ADV3-08", "advert_3", "2025-08-01", "200000.00", "", "Aug 2025", None),
    ("EXCEL-EC-2025-ADV3-09", "advert_3", "2025-09-01", "100000.00", "", "Sep 2025", None),
    ("EXCEL-EC-2025-ADV3-11", "advert_3", "2025-11-18", "150000.00", "Rec. Dilshad", "Nov 2025", "Dilshad"),
    ("EXCEL-EC-2025-ADV3-12", "advert_3", "2025-12-15", "150000.00", "Rec. Dilshad", "Dec 2025", "Dilshad"),
    ("EXCEL-EC-2025-SCRAP-01", "other_scrap_sale", "2025-01-01", "10000.00", "", "Jan 2025", None),
    ("EXCEL-EC-2025-SCRAP-02", "other_scrap_sale", "2025-02-01", "60000.00", "", "Feb 2025", None),
    ("EXCEL-EC-2025-SCRAP-12", "other_scrap_sale", "2025-12-02", "50000.00", "Rec. Dilshad", "Dec 2025", "Dilshad"),
]


def seed_extra_curriculars(db: Session) -> None:
    """Idempotently seed ExtraCurricularSource rows and historical Excel receipts."""
    source_map: dict[str, models.ExtraCurricularSource] = {}
    for cfg in DEFAULT_SOURCES:
        existing = db.query(models.ExtraCurricularSource).filter(
            models.ExtraCurricularSource.code == cfg["code"]
        ).first()
        if not existing:
            existing = models.ExtraCurricularSource(**cfg)
            db.add(existing)
            db.flush()
        source_map[cfg["code"]] = existing

    existing_refs = {
        r[0]
        for r in db.query(models.Transaction.receipt_no)
        .filter(models.Transaction.receipt_no.like("EXCEL-EC-%"))
        .all()
        if r[0]
    }

    inserted = 0
    for ref_key, src_code, dt_str, amt_str, rcpt_note, period_lbl, collector in EXCEL_EXTRA_CURRICULAR_ENTRIES:
        if ref_key in existing_refs:
            continue
        src = source_map[src_code]
        category = (
            models.TransactionCategory.ad_revenue
            if src.source_type == "advert"
            else models.TransactionCategory.other
        )
        notes_parts = [src.name]
        if period_lbl:
            notes_parts.append(period_lbl)
        if rcpt_note:
            notes_parts.append(f"Ref: {rcpt_note}")
        txn = models.Transaction(
            receipt_no=ref_key,
            date=datetime.strptime(dt_str, "%Y-%m-%d"),
            amount=Decimal(amt_str),
            type=models.TransactionType.INFLOW,
            category=category,
            notes=" — ".join(notes_parts),
            generated_by=collector or "Excel Import",
            credited_to=collector,
            payment_mode="cash",
            status=models.TransactionStatus.approved,
            created_at=datetime.utcnow(),
            approved_at=datetime.utcnow(),
            extra_source_id=src.id,
            extra_source_name=src.name,
            billing_cycle=src.billing_cycle,
            period_label=period_lbl,
        )
        db.add(txn)
        inserted += 1

    if inserted:
        db.commit()
        print(f"Seeded {inserted} historical Excel extra curricular transactions.")
    else:
        db.commit()


def _slug_code(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_")
    return f"other_{slug[:40]}" if slug else "other_custom"


def _compute_source_summary(
    src: models.ExtraCurricularSource,
    txns: list[models.Transaction],
) -> schemas.ExtraCurricularSourceOut:
    approved_total = sum(
        (t.amount for t in txns if t.status == models.TransactionStatus.approved),
        Decimal("0.00"),
    )
    pending_total = sum(
        (t.amount for t in txns if t.status == models.TransactionStatus.pending),
        Decimal("0.00"),
    )
    annual_fixed = src.annual_fixed_amount or Decimal("0.00")
    monthly_target = (annual_fixed / Decimal("12")).quantize(Decimal("0.01"))
    received_per_month = (approved_total / Decimal("12")).quantize(Decimal("0.01"))
    remaining_annual = annual_fixed - approved_total
    remaining_per_month = (remaining_annual / Decimal("12")).quantize(Decimal("0.01"))

    return schemas.ExtraCurricularSourceOut(
        id=src.id,
        code=src.code,
        name=src.name,
        source_type=src.source_type,
        billing_cycle=src.billing_cycle,
        annual_fixed_amount=annual_fixed,
        monthly_target=monthly_target,
        total_received=approved_total,
        received_per_month=received_per_month,
        remaining_annual=remaining_annual,
        remaining_per_month=remaining_per_month,
        pending_amount=pending_total,
        transaction_count=len(txns),
    )


@ec_router.get("/api/extra-curriculars", response_model=schemas.ExtraCurricularOverviewOut)
def get_extra_curriculars(
    year: int = Query(default=2026, ge=0, le=2100),
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    sources = db.query(models.ExtraCurricularSource).order_by(models.ExtraCurricularSource.id.asc()).all()
    q = db.query(models.Transaction).filter(models.Transaction.extra_source_id.isnot(None))
    if year > 0:
        q = q.filter(
            models.Transaction.date >= datetime(year, 1, 1),
            models.Transaction.date < datetime(year + 1, 1, 1),
        )
    txns = q.order_by(models.Transaction.date.desc(), models.Transaction.id.desc()).all()

    by_source: dict[int, list[models.Transaction]] = {s.id: [] for s in sources}
    for t in txns:
        if t.extra_source_id in by_source:
            by_source[t.extra_source_id].append(t)

    source_summaries = [_compute_source_summary(s, by_source[s.id]) for s in sources]
    return schemas.ExtraCurricularOverviewOut(
        year=year,
        sources=source_summaries,
        transactions=txns,
    )


@ec_router.patch("/api/extra-curriculars/{source_id}", response_model=schemas.ExtraCurricularSourceOut)
def update_extra_curricular_source(
    source_id: int,
    payload: schemas.ExtraCurricularSourceUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_super_admin),
):
    src = db.query(models.ExtraCurricularSource).filter(models.ExtraCurricularSource.id == source_id).first()
    if not src:
        raise HTTPException(status_code=404, detail="Extra curricular source not found")

    if payload.billing_cycle is not None:
        if payload.billing_cycle not in ("quarterly", "half_yearly", "yearly", "one_time"):
            raise HTTPException(status_code=400, detail="billing_cycle must be quarterly, half_yearly, yearly, or one_time")
        src.billing_cycle = payload.billing_cycle
    if payload.annual_fixed_amount is not None:
        if payload.annual_fixed_amount < 0:
            raise HTTPException(status_code=400, detail="annual_fixed_amount cannot be negative")
        src.annual_fixed_amount = payload.annual_fixed_amount
    if payload.name is not None:
        clean_name = payload.name.strip()
        if not clean_name:
            raise HTTPException(status_code=400, detail="Source name cannot be empty")
        src.name = clean_name

    db.add(src)
    _audit(
        db,
        models.AuditAction.verified,
        "extra_curricular_source",
        src.id,
        user,
        {
            "source_name": src.name,
            "billing_cycle": src.billing_cycle,
            "annual_fixed_amount": str(src.annual_fixed_amount),
        },
    )
    db.commit()
    db.refresh(src)

    current_year = datetime.now().year
    txns = (
        db.query(models.Transaction)
        .filter(
            models.Transaction.extra_source_id == src.id,
            models.Transaction.date >= datetime(current_year, 1, 1),
            models.Transaction.date < datetime(current_year + 1, 1, 1),
        )
        .all()
    )
    return _compute_source_summary(src, txns)


@ec_router.post("/api/extra-curriculars/collect", response_model=schemas.TransactionOut, status_code=201)
def collect_extra_curricular(
    payload: schemas.ExtraCurricularPaymentCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero")
    if payload.credited_to in ("Ali", "Asif"):
        raise HTTPException(status_code=400, detail="Ali and Asif are storage custodians only and cannot receive direct inflows.")
    if payload.credited_to not in TREASURER_HOLDERS:
        raise HTTPException(status_code=400, detail=f"Invalid treasurer. Must be one of: {TREASURER_HOLDERS}")
    if payload.billing_cycle not in ("quarterly", "half_yearly", "yearly", "one_time"):
        raise HTTPException(status_code=400, detail="Invalid billing_cycle")

    src: Optional[models.ExtraCurricularSource] = None
    if payload.source_id:
        src = db.query(models.ExtraCurricularSource).filter(models.ExtraCurricularSource.id == payload.source_id).first()
    elif payload.source_code and payload.source_code != "other":
        src = db.query(models.ExtraCurricularSource).filter(models.ExtraCurricularSource.code == payload.source_code).first()

    if src is None:
        custom_name = (payload.custom_source_name or "").strip()
        if not custom_name:
            raise HTTPException(status_code=400, detail="Please enter a custom source/method name for 'Others'")
        code = _slug_code(custom_name)
        src = db.query(models.ExtraCurricularSource).filter(models.ExtraCurricularSource.code == code).first()
        if not src:
            src = models.ExtraCurricularSource(
                code=code,
                name=custom_name,
                source_type="other",
                billing_cycle=payload.billing_cycle,
                annual_fixed_amount=Decimal("0.00"),
            )
            db.add(src)
            db.flush()

    if src.source_type == "advert" and payload.credited_to != "Dilshad":
        raise HTTPException(status_code=400, detail="Advert receiving is handled only by Dilshad.")

    is_super = user.role == models.UserRole.super_admin
    category = (
        models.TransactionCategory.ad_revenue
        if src.source_type == "advert"
        else models.TransactionCategory.other
    )
    receipt_no = f"EC-{src.code.upper()[:8]}-{int(datetime.utcnow().timestamp())}"
    period_part = f" ({payload.period_label})" if payload.period_label else ""
    note_text = payload.notes.strip() if payload.notes and payload.notes.strip() else f"{src.name}{period_part}"

    txn = models.Transaction(
        receipt_no=receipt_no,
        date=payload.date,
        amount=payload.amount,
        type=models.TransactionType.INFLOW,
        category=category,
        notes=note_text,
        generated_by=payload.generated_by or user.username,
        credited_to=payload.credited_to,
        payment_mode=payload.payment_mode,
        status=models.TransactionStatus.approved if is_super else models.TransactionStatus.pending,
        submitted_by_user_id=user.id,
        approved_by_user_id=user.id if is_super else None,
        approved_at=datetime.utcnow() if is_super else None,
        created_at=datetime.utcnow(),
        extra_source_id=src.id,
        extra_source_name=src.name,
        billing_cycle=payload.billing_cycle,
        period_label=payload.period_label,
    )
    db.add(txn)
    db.flush()

    audit_details = {
        "source": "extra_curriculars",
        "source_name": src.name,
        "source_type": src.source_type,
        "billing_cycle": payload.billing_cycle,
        "period_label": payload.period_label or "",
        "amount": str(payload.amount),
        "received_by": txn.generated_by,
        "credited_to": payload.credited_to,
        "payment_mode": payload.payment_mode,
        "receipt_no": receipt_no,
        "received_at": txn.date.strftime("%Y-%m-%d"),
        "auto_approved": is_super,
    }
    _audit(db, models.AuditAction.created, "transaction", txn.id, user, audit_details)

    if is_super:
        _apply_treasury_effect(db, txn)
        _audit(db, models.AuditAction.approved, "transaction", txn.id, user, audit_details)
    else:
        super_admins = db.query(models.User).filter(models.User.role == models.UserRole.super_admin).all()
        for sa in super_admins:
            msg = f"{user.username} submitted {src.name}{period_part} inflow of ₨{payload.amount} to {payload.credited_to}."
            ntype = "approval_request" if sa.username == payload.credited_to else "info"
            title = "Action Required: Pending Approval" if sa.username == payload.credited_to else f"Pending Approval for {payload.credited_to}"
            _notify(db, sa.id, ntype, title, msg, txn.id)

    db.commit()
    db.refresh(txn)
    return txn

