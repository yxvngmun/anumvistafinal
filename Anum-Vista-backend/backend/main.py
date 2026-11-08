import os
from fastapi import FastAPI, Depends, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func, text, inspect
from typing import List, Optional
from datetime import datetime, date
from decimal import Decimal

try:
    from backend import models, schemas
    from backend.database import engine, get_db
    from backend.approval_endpoints import router as approval_router, _seed_users
    from backend.auth import require_admin, require_super_admin
except ImportError:
    import models
    import schemas
    from database import engine, get_db
    from approval_endpoints import router as approval_router, _seed_users
    from auth import require_admin, require_super_admin

# Create DB tables
models.Base.metadata.create_all(bind=engine)


def _ensure_occupant_car_columns() -> None:
    with engine.connect() as conn:
        # PostgreSQL doesn't use PRAGMA. We use SQLAlchemy's inspector to find columns.
        inspector = inspect(engine)
        
        
        existing_columns = [col['name'] for col in inspector.get_columns('occupants')]
        
       
        if "car_count" not in existing_columns:
            conn.execute(
                text(
                    "ALTER TABLE occupants ADD COLUMN car_count INTEGER NOT NULL DEFAULT 1"
                )
            )
            print("Added column: car_count")

        # Check and add 'extra_car_maintenance_fee'
        if "extra_car_maintenance_fee" not in existing_columns:
            conn.execute(
                text(
                    "ALTER TABLE occupants ADD COLUMN extra_car_maintenance_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00"
                )
            )
            print("Added column: extra_car_maintenance_fee")
            
        conn.commit()


_ensure_occupant_car_columns()


def _ensure_transaction_metadata_columns() -> None:
    with engine.connect() as conn:
        inspector = inspect(engine)
        table_names = set(inspector.get_table_names())
        if "transactions" not in table_names:
            return

        existing_columns = [col["name"] for col in inspector.get_columns("transactions")]

        if "generated_by" not in existing_columns:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN generated_by VARCHAR(64)"))
            print("Added column: generated_by")

        if "created_at" not in existing_columns:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN created_at TIMESTAMP"))
            print("Added column: created_at")

        conn.execute(text("UPDATE transactions SET generated_by = 'System' WHERE generated_by IS NULL"))
        conn.execute(text("UPDATE transactions SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"))
        conn.commit()


_ensure_transaction_metadata_columns()


def _ensure_approval_columns() -> None:
    """Add approval workflow columns if they don't exist yet."""
    with engine.connect() as conn:
        inspector = inspect(engine)
        table_names = set(inspector.get_table_names())
        if "transactions" not in table_names:
            return
        existing = [col["name"] for col in inspector.get_columns("transactions")]
        migrations = [
            ("status", "ALTER TABLE transactions ADD COLUMN status VARCHAR(20) DEFAULT 'approved'"),
            ("submitted_by_user_id", "ALTER TABLE transactions ADD COLUMN submitted_by_user_id INTEGER"),
            ("approved_by_user_id", "ALTER TABLE transactions ADD COLUMN approved_by_user_id INTEGER"),
            ("approved_at", "ALTER TABLE transactions ADD COLUMN approved_at TIMESTAMP"),
            ("rejection_reason", "ALTER TABLE transactions ADD COLUMN rejection_reason VARCHAR"),
            ("cancelled_at", "ALTER TABLE transactions ADD COLUMN cancelled_at TIMESTAMP"),
            ("cancel_reason", "ALTER TABLE transactions ADD COLUMN cancel_reason VARCHAR"),
            ("credited_to", "ALTER TABLE transactions ADD COLUMN credited_to VARCHAR"),
            ("transfer_from", "ALTER TABLE transactions ADD COLUMN transfer_from VARCHAR"),
        ]
        for col_name, sql in migrations:
            if col_name not in existing:
                conn.execute(text(sql))
                print(f"Added column: {col_name}")
        conn.commit()


_ensure_approval_columns()


def _ensure_payment_mode_column() -> None:
    with engine.connect() as conn:
        inspector = inspect(engine)
        table_names = set(inspector.get_table_names())
        if "transactions" not in table_names:
            return
        existing = [col["name"] for col in inspector.get_columns("transactions")]
        if "payment_mode" not in existing:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN payment_mode VARCHAR"))
            print("Added column: payment_mode")
            conn.commit()


_ensure_payment_mode_column()


def _ensure_all_model_columns() -> None:
    with engine.connect() as conn:
        inspector = inspect(engine)
        table_names = set(inspector.get_table_names())
        if "units" in table_names:
            unit_cols = [c["name"] for c in inspector.get_columns("units")]
            if "owner_name" not in unit_cols:
                conn.execute(text("ALTER TABLE units ADD COLUMN owner_name VARCHAR"))
            if "owner_contact" not in unit_cols:
                conn.execute(text("ALTER TABLE units ADD COLUMN owner_contact VARCHAR"))
            if "is_rental" not in unit_cols:
                conn.execute(text("ALTER TABLE units ADD COLUMN is_rental BOOLEAN NOT NULL DEFAULT 0"))

        if "occupants" in table_names:
            occ_cols = [c["name"] for c in inspector.get_columns("occupants")]
            if "cnic" not in occ_cols:
                conn.execute(text("ALTER TABLE occupants ADD COLUMN cnic VARCHAR"))
            if "contact" not in occ_cols:
                conn.execute(text("ALTER TABLE occupants ADD COLUMN contact VARCHAR"))

        if "transactions" in table_names:
            txn_cols = [c["name"] for c in inspector.get_columns("transactions")]
            if "expense_description" not in txn_cols:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN expense_description VARCHAR"))
            if "expense_details" not in txn_cols:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN expense_details VARCHAR"))

        conn.commit()


_ensure_all_model_columns()

# Seed default users
try:
    try:
        from backend.database import SessionLocal
    except ImportError:
        from database import SessionLocal
    _db = SessionLocal()
    _seed_users(_db)
    _db.close()
except Exception as exc:
    print(f"Failed to seed default users: {exc}")

app = FastAPI(
    title="Property Management API",
    description="Backend API for Anum Vista property management.",
    version="1.0.0"
)

# CORS setup for frontend
_cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors_origins if o.strip()],
    allow_origin_regex=r"https://.*\.vercel\.app|http://localhost:.*|http://127\.0\.0\.1:.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register approval/auth/notification endpoints
app.include_router(approval_router)

def _month_index(year: int, month: int) -> int:
    return year * 12 + month

def _compute_expected_dues(occupant: "models.Occupant", as_of: datetime | None = None) -> Decimal:
    """Estimate outstanding dues using last_paid_month against the current month."""
    reference = as_of or datetime.now()
    base_fee = occupant.monthly_maintenance_fee or Decimal("0.00")
    extra_cars = max(0, int(occupant.car_count or 1) - 1)
    extra_fee = occupant.extra_car_maintenance_fee or Decimal("0.00")
    monthly_fee = base_fee + (extra_fee * extra_cars)

    if monthly_fee <= 0:
        return Decimal("0.00")

    if occupant.last_paid_month is None:
        # No payment history available: treat current month fee as due.
        return monthly_fee

    paid = occupant.last_paid_month
    current_idx = _month_index(reference.year, reference.month)
    paid_idx = _month_index(paid.year, paid.month)
    overdue_months = max(0, current_idx - paid_idx)
    return monthly_fee * overdue_months

@app.get("/")
def read_root():
    return {"message": "Welcome to Anum Vista Property Management API"}

@app.get("/api/tenants", response_model=List[schemas.OccupantOut])
def get_tenants(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    occupants = db.query(models.Occupant).all()
    for occupant in occupants:
        st = (occupant.status or "occupied").lower()
        occupant.status = st
        if st == "vacant":
            occupant.monthly_maintenance_fee = Decimal("4000.00")
        else:
            occupant.monthly_maintenance_fee = Decimal("5500.00")
        extra_cars = max(0, int(occupant.car_count or 1) - 1)
        extra_fee = occupant.extra_car_maintenance_fee or Decimal("2000.00")
        base_fee = occupant.monthly_maintenance_fee
        occupant.extra_cars = extra_cars
        occupant.extra_car_charges = extra_fee * extra_cars
        occupant.total_monthly_maintenance = base_fee + occupant.extra_car_charges
        occupant.expected_dues = _compute_expected_dues(occupant)
    return occupants


@app.patch("/api/tenants/{occupant_id}/cars", response_model=schemas.OccupantOut)
def update_tenant_car_maintenance(
    occupant_id: int,
    payload: schemas.OccupantCarUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    if payload.car_count < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="car_count cannot be negative")
    if payload.extra_car_maintenance_fee < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="extra_car_maintenance_fee cannot be negative",
        )

    occupant = db.query(models.Occupant).filter(models.Occupant.id == occupant_id).first()
    if not occupant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    occupant.car_count = payload.car_count
    occupant.extra_car_maintenance_fee = payload.extra_car_maintenance_fee
    if payload.status:
        st = payload.status.strip().lower()
        if st in ("vacant", "occupied"):
            occupant.status = st
            if st == "vacant":
                occupant.monthly_maintenance_fee = Decimal("4000.00")
            else:
                occupant.monthly_maintenance_fee = Decimal("5500.00")

    db.add(occupant)
    db.commit()
    db.refresh(occupant)

    st = (occupant.status or "occupied").lower()
    if st == "vacant":
        occupant.monthly_maintenance_fee = Decimal("4000.00")
    else:
        occupant.monthly_maintenance_fee = Decimal("5500.00")

    extra_cars = max(0, int(occupant.car_count or 1) - 1)
    extra_fee = occupant.extra_car_maintenance_fee or Decimal("2000.00")
    base_fee = occupant.monthly_maintenance_fee
    occupant.extra_cars = extra_cars
    occupant.extra_car_charges = extra_fee * extra_cars
    occupant.total_monthly_maintenance = base_fee + occupant.extra_car_charges
    occupant.expected_dues = _compute_expected_dues(occupant)
    return occupant


@app.patch("/api/tenants/{occupant_id}", response_model=schemas.OccupantOut)
def update_tenant(
    occupant_id: int,
    payload: schemas.OccupantUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_super_admin),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Resident name cannot be empty")

    occupant = db.query(models.Occupant).filter(models.Occupant.id == occupant_id).first()
    if not occupant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    old_name = occupant.name
    occupant.name = name
    if payload.contact is not None:
        occupant.contact = payload.contact.strip() or None
    if payload.cnic is not None:
        occupant.cnic = payload.cnic.strip() or None

    db.add(occupant)

    _audit(db, models.AuditAction.verified, "occupant", occupant.id, user, {
        "action": "update_name",
        "old_name": old_name,
        "new_name": name,
        "unit_no": occupant.unit.unit_no if occupant.unit else "",
    })

    db.commit()
    db.refresh(occupant)

    extra_cars = max(0, int(occupant.car_count or 1) - 1)
    extra_fee = occupant.extra_car_maintenance_fee or Decimal("0.00")
    base_fee = occupant.monthly_maintenance_fee or Decimal("0.00")
    occupant.extra_cars = extra_cars
    occupant.extra_car_charges = extra_fee * extra_cars
    occupant.total_monthly_maintenance = base_fee + occupant.extra_car_charges
    occupant.expected_dues = _compute_expected_dues(occupant)
    return occupant

@app.get("/api/transactions", response_model=List[schemas.TransactionOut])
def get_transactions(
    db: Session = Depends(get_db),
    year: int | None = Query(default=None, ge=1900, le=2100),
    limit: int | None = Query(default=None, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    status: Optional[str] = Query(default=None),
    user: models.User = Depends(require_admin),
):
    """
    Supports optional year/pagination and status filtering.
    """
    q = db.query(models.Transaction).order_by(models.Transaction.date.desc())
    if year is not None:
        q = q.filter(func.extract("year", models.Transaction.date) == year)
    if status is not None:
        q = q.filter(models.Transaction.status == status)
    if offset:
        q = q.offset(offset)
    if limit is not None:
        q = q.limit(limit)
    transactions = q.all()
    return transactions


@app.get("/api/expense-descriptions", response_model=List[schemas.ExpenseDescriptionOut])
def get_expense_descriptions(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    return db.query(models.ExpenseDescription).order_by(models.ExpenseDescription.description.asc()).all()

@app.post("/api/transactions", response_model=schemas.TransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(
    transaction: schemas.TransactionCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    payload = transaction.model_dump()
    if not payload.get("generated_by"):
        payload["generated_by"] = user.username
    is_super = user.role == models.UserRole.super_admin
    payload["status"] = (
        models.TransactionStatus.approved if is_super else models.TransactionStatus.pending
    )
    payload["submitted_by_user_id"] = user.id
    if is_super:
        payload["approved_by_user_id"] = user.id
        payload["approved_at"] = datetime.utcnow()
    db_txn = models.Transaction(**payload)
    if db_txn.created_at is None:
        db_txn.created_at = datetime.utcnow()
    db.add(db_txn)

    db.flush()

    db.add(
        models.AuditLog(
            action=models.AuditAction.created,
            entity_type="transaction",
            entity_id=db_txn.id,
            performed_by_user_id=user.id,
            performed_by_username=user.username,
            details=f'{{"source":"transactions","amount":"{db_txn.amount}","auto_approved":{str(is_super).lower()}}}',
        )
    )

    if is_super:
        try:
            from backend.approval_endpoints import _apply_treasury_effect
        except ImportError:
            from approval_endpoints import _apply_treasury_effect
        _apply_treasury_effect(db, db_txn)
        if db_txn.occupant_id and db_txn.category == models.TransactionCategory.maintenance:
            occupant = db.query(models.Occupant).filter(models.Occupant.id == db_txn.occupant_id).first()
            if occupant and (occupant.last_paid_month is None or db_txn.date > occupant.last_paid_month):
                occupant.last_paid_month = db_txn.date
                db.add(occupant)
        db.add(
            models.AuditLog(
                action=models.AuditAction.approved,
                entity_type="transaction",
                entity_id=db_txn.id,
                performed_by_user_id=user.id,
                performed_by_username=user.username,
                details=f'{{"source":"super_admin_direct","amount":"{db_txn.amount}"}}',
            )
        )
    else:
        super_admins = db.query(models.User).filter(models.User.role == models.UserRole.super_admin).all()
        for sa in super_admins:
            msg = f"{user.username} submitted a transaction of ₨{db_txn.amount}."
            if sa.username == db_txn.credited_to:
                db.add(models.Notification(user_id=sa.id, type="approval_request", title="Action Required: Pending Approval", message=msg, transaction_id=db_txn.id))
            else:
                db.add(models.Notification(user_id=sa.id, type="info", title=f"Pending Approval for {db_txn.credited_to}", message=msg, transaction_id=db_txn.id))

    db.commit()
    db.refresh(db_txn)
    return db_txn


@app.get("/api/dashboard/metrics", response_model=schemas.DashboardMetrics)
def get_dashboard_metrics(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_super_admin),
):
    current_month = datetime.now().month
    current_year = datetime.now().year

    # Total revenue (INFLOW this month) - excludes TRANSFER, only approved
    total_rev = db.query(func.sum(models.Transaction.amount)).filter(
        models.Transaction.type == models.TransactionType.INFLOW,
        models.Transaction.status == models.TransactionStatus.approved,
        func.extract('month', models.Transaction.date) == current_month,
        func.extract('year', models.Transaction.date) == current_year
    ).scalar() or Decimal('0.00')

    # Treasury Balance (All approved inflows - All approved outflows)
    inflows = db.query(func.sum(models.Transaction.amount)).filter(
        models.Transaction.type == models.TransactionType.INFLOW,
        models.Transaction.status == models.TransactionStatus.approved,
    ).scalar() or Decimal('0.00')
    outflows = db.query(func.sum(models.Transaction.amount)).filter(
        models.Transaction.type == models.TransactionType.OUTFLOW,
        models.Transaction.status == models.TransactionStatus.approved,
    ).scalar() or Decimal('0.00')
    treasury_balance = inflows - outflows

    # Total overdues derived from tenant expected dues.
    occupants = db.query(models.Occupant).all()
    total_overdues = sum((_compute_expected_dues(occupant) for occupant in occupants), Decimal("0.00"))

    # Ad revenue (All time, approved only)
    ad_rev = db.query(func.sum(models.Transaction.amount)).filter(
        models.Transaction.category == models.TransactionCategory.ad_revenue,
        models.Transaction.status == models.TransactionStatus.approved,
    ).scalar() or Decimal('0.00')

    # Total apartments
    total_apartments = db.query(func.count(models.Unit.id)).scalar() or 0

    # Advance payments: residents whose last_paid_month >= current month
    now = datetime.now()
    current_month_date = datetime(now.year, now.month, 1)
    advance_count_amount = Decimal("0.00")
    for occ in occupants:
        if occ.last_paid_month and occ.last_paid_month > current_month_date:
            # months ahead * monthly fee
            paid_idx = _month_index(occ.last_paid_month.year, occ.last_paid_month.month)
            curr_idx = _month_index(now.year, now.month)
            months_ahead = paid_idx - curr_idx
            if months_ahead > 0:
                base = occ.monthly_maintenance_fee or Decimal("0.00")
                extra_cars = max(0, int(occ.car_count or 1) - 1)
                extra = occ.extra_car_maintenance_fee or Decimal("0.00")
                advance_count_amount += (base + extra * extra_cars) * months_ahead

    # Pending approvals count
    pending_count = db.query(func.count(models.Transaction.id)).filter(
        models.Transaction.status == models.TransactionStatus.pending,
    ).scalar() or 0

    return schemas.DashboardMetrics(
        total_revenue=total_rev,
        treasury_balance=treasury_balance,
        total_overdues=total_overdues,
        ad_revenue=ad_rev,
        total_apartments=total_apartments,
        advance_payments=advance_count_amount,
        pending_approvals=pending_count,
    )


@app.get("/api/reports/monthly", response_model=schemas.MonthlyReportOut)
def get_monthly_report(
    year: int = Query(..., ge=1900, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
    user: models.User = Depends(require_super_admin),
):
    # Transaction-based totals
    base = db.query(models.Transaction).filter(
        func.extract("year", models.Transaction.date) == year,
        func.extract("month", models.Transaction.date) == month,
    )
    maintenance_received = base.filter(
        models.Transaction.type == models.TransactionType.INFLOW,
        models.Transaction.category == models.TransactionCategory.maintenance,
    ).with_entities(func.coalesce(func.sum(models.Transaction.amount), 0)).scalar() or Decimal("0.00")

    inflow_total = base.filter(models.Transaction.type == models.TransactionType.INFLOW).with_entities(
        func.coalesce(func.sum(models.Transaction.amount), 0)
    ).scalar() or Decimal("0.00")
    outflow_total = base.filter(models.Transaction.type == models.TransactionType.OUTFLOW).with_entities(
        func.coalesce(func.sum(models.Transaction.amount), 0)
    ).scalar() or Decimal("0.00")
    transfer_total = base.filter(models.Transaction.type == models.TransactionType.TRANSFER).with_entities(
        func.coalesce(func.sum(models.Transaction.amount), 0)
    ).scalar() or Decimal("0.00")

    inflow_by_category = {}
    for cat, total in (
        base.filter(models.Transaction.type == models.TransactionType.INFLOW)
        .with_entities(models.Transaction.category, func.sum(models.Transaction.amount))
        .group_by(models.Transaction.category)
        .all()
    ):
        inflow_by_category[str(cat.value if hasattr(cat, "value") else cat)] = total or Decimal("0.00")

    outflow_by_category = {}
    for cat, total in (
        base.filter(models.Transaction.type == models.TransactionType.OUTFLOW)
        .with_entities(models.Transaction.category, func.sum(models.Transaction.amount))
        .group_by(models.Transaction.category)
        .all()
    ):
        outflow_by_category[str(cat.value if hasattr(cat, "value") else cat)] = total or Decimal("0.00")

    # History-based treasury opening/closing if available (from funds_position_entries)
    period = date(year, month, 1)
    treasury_opening = (
        db.query(models.FundsPositionEntry.amount)
        .filter(
            models.FundsPositionEntry.period == period,
            models.FundsPositionEntry.section == "opening_balance",
            models.FundsPositionEntry.label == "Cash in Hand - Opening Balance",
        )
        .scalar()
    )
    treasury_closing = (
        db.query(models.FundsPositionEntry.amount)
        .filter(
            models.FundsPositionEntry.period == period,
            models.FundsPositionEntry.section == "closing_balance",
            models.FundsPositionEntry.label == "Cash in Hand - Closing Balance",
        )
        .scalar()
    )

    # Per-treasurer rollups for the month (approved only)
    inflow_by_treasurer: dict[str, Decimal] = {}
    outflow_by_treasurer: dict[str, Decimal] = {}
    treasurer_rows = (
        base.filter(models.Transaction.status == models.TransactionStatus.approved)
        .with_entities(
            models.Transaction.type,
            models.Transaction.credited_to,
            func.sum(models.Transaction.amount),
        )
        .group_by(models.Transaction.type, models.Transaction.credited_to)
        .all()
    )
    for ttype, holder, total in treasurer_rows:
        if not holder:
            continue
        bucket = inflow_by_treasurer if ttype == models.TransactionType.INFLOW else (
            outflow_by_treasurer if ttype == models.TransactionType.OUTFLOW else None
        )
        if bucket is None:
            continue
        bucket[holder] = bucket.get(holder, Decimal("0.00")) + (total or Decimal("0.00"))

    # Detailed line items for the month
    rows = (
        base.order_by(models.Transaction.date.asc(), models.Transaction.id.asc()).all()
    )
    occupant_ids = {row.occupant_id for row in rows if row.occupant_id}
    occupants_map: dict[int, models.Occupant] = {}
    if occupant_ids:
        for occ in db.query(models.Occupant).filter(models.Occupant.id.in_(occupant_ids)).all():
            occupants_map[occ.id] = occ

    transactions = []
    for row in rows:
        occ = occupants_map.get(row.occupant_id) if row.occupant_id else None
        transactions.append(
            schemas.MonthlyTransactionLine(
                id=row.id,
                date=row.date,
                type=row.type.value if hasattr(row.type, "value") else str(row.type),
                category=row.category.value if hasattr(row.category, "value") else str(row.category),
                amount=row.amount,
                receipt_no=row.receipt_no,
                occupant_name=occ.name if occ else None,
                unit_no=occ.unit.unit_no if occ and occ.unit else None,
                notes=row.notes,
                expense_description=row.expense_description,
                expense_details=row.expense_details,
                generated_by=row.generated_by,
                credited_to=row.credited_to,
                transfer_from=row.transfer_from,
                payment_mode=row.payment_mode,
                status=row.status.value if hasattr(row.status, "value") else str(row.status),
            )
        )

    # Treasurer balance snapshot — pick the latest FundsInHandEntry period <= report month
    period_date = date(year, month, 1)
    split_period = (
        db.query(func.max(models.FundsInHandEntry.period))
        .filter(models.FundsInHandEntry.period <= period_date)
        .scalar()
    )
    treasurer_split: list[schemas.TreasurerSplit] = []
    if split_period:
        for person, amount in (
            db.query(models.FundsInHandEntry.person, models.FundsInHandEntry.amount)
            .filter(models.FundsInHandEntry.period == split_period)
            .all()
        ):
            treasurer_split.append(schemas.TreasurerSplit(person=person, amount=amount))

    net_flow = inflow_total - outflow_total

    return schemas.MonthlyReportOut(
        year=year,
        month=month,
        maintenance_received=maintenance_received,
        inflow_total=inflow_total,
        outflow_total=outflow_total,
        transfer_total=transfer_total,
        net_flow=net_flow,
        treasury_opening=treasury_opening,
        treasury_closing=treasury_closing,
        inflow_by_category=inflow_by_category,
        outflow_by_category=outflow_by_category,
        inflow_by_treasurer=inflow_by_treasurer,
        outflow_by_treasurer=outflow_by_treasurer,
        transactions=transactions,
        treasurer_split=treasurer_split,
    )


@app.get("/api/treasury/current")
def get_current_treasury_split(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_super_admin),
):
    """
    Returns latest known split across the named holders from funds_in_hand_entries.
    """
    holders = ["Naveed", "Asif", "Dilshad", "Ali", "Danish"]
    latest_period = db.query(func.max(models.FundsInHandEntry.period)).scalar()
    if latest_period is None:
        return {"period": None, "holders": {h: "0.00" for h in holders}}
    rows = (
        db.query(models.FundsInHandEntry.person, models.FundsInHandEntry.amount)
        .filter(models.FundsInHandEntry.period == latest_period)
        .filter(models.FundsInHandEntry.person.in_(holders))
        .all()
    )
    by_holder = {h: Decimal("0.00") for h in holders}
    for person, amount in rows:
        by_holder[person] = amount
    return {
        "period": latest_period,
        "holders": {person: str(amount) for person, amount in by_holder.items()},
    }


@app.get("/api/history/funds-position", response_model=List[schemas.FundsPositionEntryOut])
def get_funds_position_history(
    db: Session = Depends(get_db),
    year: int | None = Query(default=None, ge=1900, le=2100),
    user: models.User = Depends(require_super_admin),
):
    q = db.query(models.FundsPositionEntry).order_by(models.FundsPositionEntry.period.asc())
    if year is not None:
        q = q.filter(func.extract("year", models.FundsPositionEntry.period) == year)
    return q.all()


@app.get("/api/history/funds-in-hand", response_model=List[schemas.FundsInHandEntryOut])
def get_funds_in_hand_history(
    db: Session = Depends(get_db),
    year: int | None = Query(default=None, ge=1900, le=2100),
    user: models.User = Depends(require_super_admin),
):
    q = db.query(models.FundsInHandEntry).order_by(models.FundsInHandEntry.period.asc(), models.FundsInHandEntry.person.asc())
    if year is not None:
        q = q.filter(func.extract("year", models.FundsInHandEntry.period) == year)
    return q.all()


@app.get("/api/history/outstanding-maintenance", response_model=List[schemas.OutstandingMaintenanceSnapshotOut])
def get_outstanding_maintenance_history(
    db: Session = Depends(get_db),
    as_of: date | None = None,
    user: models.User = Depends(require_super_admin),
):
    q = db.query(models.OutstandingMaintenanceSnapshot).order_by(models.OutstandingMaintenanceSnapshot.unit_no.asc())
    if as_of is not None:
        q = q.filter(models.OutstandingMaintenanceSnapshot.as_of == as_of)
    return q.all()


# ─── RESIDENT LEDGER ─────────────────────────────────────────────────────────
@app.get("/api/tenants/{occupant_id}/ledger", response_model=schemas.LedgerOut)
def get_resident_ledger(
    occupant_id: int,
    year: int = Query(default=None, ge=1900, le=2100),
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    occupant = db.query(models.Occupant).filter(models.Occupant.id == occupant_id).first()
    if not occupant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    target_year = year or datetime.now().year
    extra_cars = max(0, int(occupant.car_count or 1) - 1)
    extra_fee = occupant.extra_car_maintenance_fee or Decimal("0.00")
    base_fee = occupant.monthly_maintenance_fee or Decimal("0.00")
    monthly_fee = base_fee + (extra_fee * extra_cars)

    # Get all approved maintenance transactions for this occupant
    txns = (
        db.query(models.Transaction)
        .filter(
            models.Transaction.occupant_id == occupant_id,
            models.Transaction.category == models.TransactionCategory.maintenance,
            models.Transaction.status == models.TransactionStatus.approved,
        )
        .order_by(models.Transaction.date.asc())
        .all()
    )

    # Build a map: month_key -> list of transaction ids and amounts
    month_txns: dict[str, list[tuple[int, Decimal]]] = {}
    for tx in txns:
        if tx.date:
            key = f"{tx.date.year}-{tx.date.month:02d}"
            month_txns.setdefault(key, []).append((tx.id, tx.amount))

    month_names = ["", "January", "February", "March", "April", "May", "June",
                   "July", "August", "September", "October", "November", "December"]
    now = datetime.now()
    current_key = f"{now.year}-{now.month:02d}"

    entries = []
    for m in range(1, 13):
        key = f"{target_year}-{m:02d}"
        paid_list = month_txns.get(key, [])
        total_paid = sum(amt for _, amt in paid_list)
        tx_ids = [tid for tid, _ in paid_list]

        # Determine status
        if total_paid >= monthly_fee:
            if key > current_key:
                status = "advance"
            else:
                status = "paid"
        elif total_paid > 0:
            status = "partial"
        elif key <= current_key:
            # Check if this month was covered by last_paid_month
            if occupant.last_paid_month:
                paid_key = f"{occupant.last_paid_month.year}-{occupant.last_paid_month.month:02d}"
                if key <= paid_key:
                    status = "paid"
                    total_paid = monthly_fee  # covered
                else:
                    status = "pending"
            else:
                status = "pending"
        else:
            status = "upcoming"

        entries.append(schemas.LedgerEntry(
            month_key=key,
            label=f"{month_names[m]} {target_year}",
            status=status,
            amount_due=monthly_fee,
            amount_paid=total_paid,
            transaction_ids=tx_ids,
        ))

    return schemas.LedgerOut(
        occupant_id=occupant.id,
        occupant_name=occupant.name,
        unit_no=occupant.unit.unit_no if occupant.unit else "",
        monthly_fee=monthly_fee,
        entries=entries,
    )


# ─── REPORTS ─────────────────────────────────────────────────────────────────
@app.get("/api/reports/pending-dues", response_model=schemas.PendingDuesReport)
def get_pending_dues_report(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    now = datetime.now()
    occupants = db.query(models.Occupant).all()
    entries = []
    total = Decimal("0.00")

    for occ in occupants:
        dues = _compute_expected_dues(occ)
        if dues <= 0:
            continue
        extra_cars = max(0, int(occ.car_count or 1) - 1)
        extra_fee = occ.extra_car_maintenance_fee or Decimal("0.00")
        base_fee = occ.monthly_maintenance_fee or Decimal("0.00")
        monthly_fee = base_fee + (extra_fee * extra_cars)
        months_overdue = int(dues / monthly_fee) if monthly_fee > 0 else 0
        lp = None
        if occ.last_paid_month:
            lp = f"{occ.last_paid_month.year}-{occ.last_paid_month.month:02d}"
        entries.append(schemas.PendingDuesReportEntry(
            occupant_id=occ.id,
            name=occ.name,
            unit_no=occ.unit.unit_no if occ.unit else "",
            monthly_fee=monthly_fee,
            months_overdue=months_overdue,
            total_due=dues,
            last_paid_month=lp,
        ))
        total += dues

    entries.sort(key=lambda e: e.total_due, reverse=True)
    return schemas.PendingDuesReport(
        as_of=now.strftime("%Y-%m-%d"),
        total_due=total,
        entries=entries,
    )


@app.get("/api/reports/advance-payments", response_model=schemas.AdvancePaymentReport)
def get_advance_payments_report(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    now = datetime.now()
    current_month_date = datetime(now.year, now.month, 1)
    occupants = db.query(models.Occupant).all()
    entries = []

    for occ in occupants:
        if not occ.last_paid_month or occ.last_paid_month <= current_month_date:
            continue
        paid_idx = _month_index(occ.last_paid_month.year, occ.last_paid_month.month)
        curr_idx = _month_index(now.year, now.month)
        months_ahead = paid_idx - curr_idx
        if months_ahead > 0:
            entries.append(schemas.AdvancePaymentEntry(
                occupant_id=occ.id,
                name=occ.name,
                unit_no=occ.unit.unit_no if occ.unit else "",
                paid_through=f"{occ.last_paid_month.year}-{occ.last_paid_month.month:02d}",
                months_ahead=months_ahead,
            ))

    entries.sort(key=lambda e: e.months_ahead, reverse=True)
    return schemas.AdvancePaymentReport(
        as_of=now.strftime("%Y-%m-%d"),
        entries=entries,
    )


@app.get("/api/reports/expenses", response_model=schemas.ExpenseReport)
def get_expense_report(
    year: int = Query(..., ge=1900, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    base = db.query(models.Transaction).filter(
        models.Transaction.type == models.TransactionType.OUTFLOW,
        models.Transaction.status == models.TransactionStatus.approved,
        func.extract("year", models.Transaction.date) == year,
        func.extract("month", models.Transaction.date) == month,
    )

    rows = (
        base.with_entities(
            models.Transaction.category,
            models.Transaction.expense_description,
            func.sum(models.Transaction.amount),
            func.count(models.Transaction.id),
        )
        .group_by(models.Transaction.category, models.Transaction.expense_description)
        .all()
    )

    entries = []
    total = Decimal("0.00")
    for cat, desc, total_amt, cnt in rows:
        cat_val = cat.value if hasattr(cat, "value") else str(cat)
        amt = total_amt or Decimal("0.00")
        entries.append(schemas.ExpenseReportEntry(
            category=cat_val,
            description=desc,
            total=amt,
            count=cnt,
        ))
        total += amt

    entries.sort(key=lambda e: e.total, reverse=True)
    return schemas.ExpenseReport(
        year=year,
        month=month,
        total_expenses=total,
        entries=entries,
    )


@app.get("/api/reports/cash-reconciliation", response_model=schemas.CashReconciliationReport)
def get_cash_reconciliation_report(
    year: int = Query(..., ge=1900, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
    user: models.User = Depends(require_super_admin),
):
    base = db.query(models.Transaction).filter(
        models.Transaction.status == models.TransactionStatus.approved,
        func.extract("year", models.Transaction.date) == year,
        func.extract("month", models.Transaction.date) == month,
    )

    inflow = base.filter(models.Transaction.type == models.TransactionType.INFLOW).with_entities(
        func.coalesce(func.sum(models.Transaction.amount), 0)
    ).scalar() or Decimal("0.00")

    outflow = base.filter(models.Transaction.type == models.TransactionType.OUTFLOW).with_entities(
        func.coalesce(func.sum(models.Transaction.amount), 0)
    ).scalar() or Decimal("0.00")

    transfer = base.filter(models.Transaction.type == models.TransactionType.TRANSFER).with_entities(
        func.coalesce(func.sum(models.Transaction.amount), 0)
    ).scalar() or Decimal("0.00")

    # Opening/closing from funds_position_entries if available
    period = date(year, month, 1)
    opening = (
        db.query(func.sum(models.FundsPositionEntry.amount))
        .filter(models.FundsPositionEntry.period == period,
                models.FundsPositionEntry.section == "opening_balance")
        .scalar()
    )
    closing = (
        db.query(func.sum(models.FundsPositionEntry.amount))
        .filter(models.FundsPositionEntry.period == period,
                models.FundsPositionEntry.section == "closing_balance")
        .scalar()
    )

    # Per-treasurer balances for this month
    treasurer_rows = (
        db.query(models.FundsInHandEntry.person, models.FundsInHandEntry.amount)
        .filter(models.FundsInHandEntry.period == period)
        .all()
    )
    by_treasurer = {person: amount for person, amount in treasurer_rows}

    return schemas.CashReconciliationReport(
        year=year,
        month=month,
        opening_balance=opening,
        total_inflow=inflow,
        total_outflow=outflow,
        total_transfer=transfer,
        net_flow=inflow - outflow,
        closing_balance=closing,
        by_treasurer=by_treasurer,
    )


# ─── DUE REMINDERS ──────────────────────────────────────────────────────────
@app.get("/api/reminders/due", response_model=schemas.DueRemindersOut)
def get_due_reminders(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    """Generate a list of all residents with pending dues, suitable for sending reminders."""
    now = datetime.now()
    occupants = db.query(models.Occupant).all()
    entries = []
    month_names = ["", "January", "February", "March", "April", "May", "June",
                   "July", "August", "September", "October", "November", "December"]

    for occ in occupants:
        dues = _compute_expected_dues(occ)
        if dues <= 0:
            continue

        extra_cars = max(0, int(occ.car_count or 1) - 1)
        extra_fee = occ.extra_car_maintenance_fee or Decimal("0.00")
        base_fee = occ.monthly_maintenance_fee or Decimal("0.00")
        monthly_fee = base_fee + (extra_fee * extra_cars)
        months_overdue = int(dues / monthly_fee) if monthly_fee > 0 else 0

        # Build unpaid month labels
        unpaid_labels = []
        if occ.last_paid_month:
            cursor = date(occ.last_paid_month.year, occ.last_paid_month.month, 1)
            if cursor.month == 12:
                cursor = date(cursor.year + 1, 1, 1)
            else:
                cursor = date(cursor.year, cursor.month + 1, 1)
            current = date(now.year, now.month, 1)
            while cursor <= current:
                unpaid_labels.append(f"{month_names[cursor.month]} {cursor.year}")
                if cursor.month == 12:
                    cursor = date(cursor.year + 1, 1, 1)
                else:
                    cursor = date(cursor.year, cursor.month + 1, 1)
        else:
            unpaid_labels.append(f"{month_names[now.month]} {now.year}")

        entries.append(schemas.DueReminderEntry(
            occupant_id=occ.id,
            name=occ.name,
            unit_no=occ.unit.unit_no if occ.unit else "",
            contact=occ.contact,
            monthly_fee=monthly_fee,
            months_overdue=months_overdue,
            total_due=dues,
            unpaid_months=unpaid_labels,
        ))

    entries.sort(key=lambda e: e.total_due, reverse=True)
    return schemas.DueRemindersOut(
        generated_at=now.strftime("%Y-%m-%d %H:%M:%S"),
        total_residents_due=len(entries),
        entries=entries,
    )


@app.post("/api/reminders/due/generate")
def generate_due_reminder_notifications(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_super_admin),
):
    """Create in-app notification reminders for all super admins about overdue residents."""
    now = datetime.now()
    occupants = db.query(models.Occupant).all()
    overdue_count = 0

    for occ in occupants:
        dues = _compute_expected_dues(occ)
        if dues <= 0:
            continue
        overdue_count += 1

    if overdue_count == 0:
        return {"ok": True, "message": "No overdue residents.", "reminders_sent": 0}

    super_admins = db.query(models.User).filter(models.User.role == models.UserRole.super_admin).all()
    for sa in super_admins:
        db.add(models.Notification(
            user_id=sa.id,
            type="reminder",
            title="Monthly Due Reminder",
            message=f"{overdue_count} resident(s) have pending maintenance dues as of {now.strftime('%B %Y')}. Please review the pending dues report.",
        ))
    db.commit()
    return {"ok": True, "message": f"Reminders sent to {len(super_admins)} super admins.", "reminders_sent": len(super_admins)}


# ─── WHATSAPP INTEGRATION ────────────────────────────────────────────────────
try:
    from backend.whatsapp_service import get_adapter, is_configured, get_provider_name, WhatsAppMessage
except ImportError:
    from whatsapp_service import get_adapter, is_configured, get_provider_name, WhatsAppMessage


@app.get("/api/whatsapp/config")
def get_whatsapp_config(user: models.User = Depends(require_admin)):
    return {"configured": is_configured(), "provider": get_provider_name()}


@app.post("/api/whatsapp/send")
def send_whatsapp_message(
    payload: dict,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    phone = payload.get("phone", "")
    message = payload.get("message", "")
    occupant_id = payload.get("occupant_id")

    if not phone or not message:
        raise HTTPException(status_code=400, detail="phone and message are required")

    adapter = get_adapter()
    result = adapter.send_message(WhatsAppMessage(to=phone, body=message, occupant_id=occupant_id))

    if result.success:
        return {"ok": True, "message": f"Sent to {phone}", "message_id": result.message_id}
    raise HTTPException(status_code=502, detail=result.error or "Failed to send")


@app.post("/api/whatsapp/send-bulk")
def send_whatsapp_bulk(
    payload: dict,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_super_admin),
):
    entries = payload.get("entries", [])
    if not entries:
        raise HTTPException(status_code=400, detail="entries list is required")

    adapter = get_adapter()
    messages = [
        WhatsAppMessage(to=e["phone"], body=e["message"], occupant_id=e.get("occupant_id"))
        for e in entries
    ]
    results = adapter.send_bulk(messages)
    sent = sum(1 for r in results if r.success)
    failed = len(results) - sent
    return {"ok": True, "sent": sent, "failed": failed}
