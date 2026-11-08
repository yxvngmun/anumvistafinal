"""approval_endpoints.py — All new governance endpoints (auth, approval, notifications, audit, dues-first receipts)"""
from fastapi import APIRouter, Depends, HTTPException, status, Query, Header
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, date, timedelta
from decimal import Decimal
import json

try:
    from backend import models, schemas
    from backend.database import get_db
    from backend.auth import (verify_password, create_access_token, get_current_user,
                               require_admin, require_super_admin, hash_password)
except ImportError:
    import models, schemas
    from database import get_db
    from auth import (verify_password, create_access_token, get_current_user,
                      require_admin, require_super_admin, hash_password)

router = APIRouter()
TREASURER_HOLDERS = ["Naveed", "Asif", "Dilshad", "Ali", "Danish"]

def _seed_users(db: Session):
    accounts = [
        {"username": "admin", "email": "admin@anumvista.com", "password": "admin123", "role": models.UserRole.admin},
        {"username": "superadmin", "email": "superadmin@anumvista.com", "password": "super123", "role": models.UserRole.super_admin},
        {"username": "anumvista", "email": None, "password": "anumvista123", "role": models.UserRole.super_admin},
    ]
    # Add unique super_admin accounts for treasurers
    for t in TREASURER_HOLDERS:
        accounts.append({
            "username": t,
            "email": f"{t.lower()}@anumvista.com",
            "password": f"{t.lower()}123",
            "role": models.UserRole.super_admin
        })

    for acct in accounts:
        if not db.query(models.User).filter(models.User.username == acct["username"]).first():
            db.add(models.User(username=acct["username"], email=acct["email"],
                               hashed_password=hash_password(acct["password"]), role=acct["role"]))
            
    # Seed Advertisements
    for ad_name in ["Ad A", "Ad B", "Ad C"]:
        if not db.query(models.Advertisement).filter(models.Advertisement.advertiser_name == ad_name).first():
            db.add(models.Advertisement(advertiser_name=ad_name, annual_fee=0))
            
    db.commit()

def _audit(db, action, entity_type, entity_id, user, details=None):
    db.add(models.AuditLog(action=action, entity_type=entity_type, entity_id=entity_id,
                           performed_by_user_id=user.id if user else None,
                           performed_by_username=user.username if user else None,
                           details=json.dumps(details) if details else None))

def _notify(db, user_id, ntype, title, message, txn_id=None):
    db.add(models.Notification(user_id=user_id, type=ntype, title=title, message=message, transaction_id=txn_id))

def _month_index(year, month):
    return year * 12 + month

def _get_unpaid_months(occupant):
    now = datetime.now()
    current = date(now.year, now.month, 1)
    months = []
    if occupant.last_paid_month is None:
        months.append(current)
        return months
    paid = occupant.last_paid_month
    cursor = date(paid.year, paid.month, 1)
    # Move to next month after last paid
    if cursor.month == 12:
        cursor = date(cursor.year + 1, 1, 1)
    else:
        cursor = date(cursor.year, cursor.month + 1, 1)
    while cursor <= current:
        months.append(cursor)
        if cursor.month == 12:
            cursor = date(cursor.year + 1, 1, 1)
        else:
            cursor = date(cursor.year, cursor.month + 1, 1)
    # If resident is all caught up, provide next 3 upcoming months for advance payments
    if not months:
        for _ in range(3):
            months.append(cursor)
            if cursor.month == 12:
                cursor = date(cursor.year + 1, 1, 1)
            else:
                cursor = date(cursor.year, cursor.month + 1, 1)
    return months

# ─── AUTH ─────────────────────────────────────────────────────────────────────
@router.post("/api/auth/login", response_model=schemas.TokenResponse)
@router.post("/auth/login", response_model=schemas.TokenResponse, include_in_schema=False)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(data={"sub": user.username, "role": user.role.value})
    _audit(db, models.AuditAction.login, "user", user.id, user, {"username": user.username})
    db.commit()
    return schemas.TokenResponse(access_token=token, token_type="bearer", role=user.role.value)

@router.get("/api/auth/me", response_model=schemas.UserOut)
def get_me(user: models.User = Depends(get_current_user)):
    return user

@router.post("/api/auth/change-password")
def change_password(
    payload: schemas.ChangePasswordRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters long")
    if payload.new_password == payload.current_password:
        raise HTTPException(status_code=400, detail="New password must be different from current password")

    user.hashed_password = hash_password(payload.new_password)
    db.add(user)
    _audit(db, models.AuditAction.verified, "user", user.id, user, {"event": "password_changed"})
    db.commit()
    return {"ok": True, "message": "Password updated successfully"}

@router.get("/api/treasurers")
def get_treasurers(user: models.User = Depends(require_admin)):
    return {"treasurers": TREASURER_HOLDERS}

# ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
@router.get("/api/notifications", response_model=List[schemas.NotificationOut])
def get_notifications(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    return db.query(models.Notification).filter(
        models.Notification.user_id == user.id
    ).order_by(models.Notification.created_at.desc()).limit(50).all()

@router.get("/api/notifications/unread-count", response_model=schemas.NotificationCount)
def unread_count(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    count = db.query(func.count(models.Notification.id)).filter(
        models.Notification.user_id == user.id, models.Notification.is_read == False
    ).scalar() or 0
    return schemas.NotificationCount(unread_count=count)

@router.patch("/api/notifications/{nid}/read")
def mark_read(nid: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    n = db.query(models.Notification).filter(models.Notification.id == nid, models.Notification.user_id == user.id).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.is_read = True
    db.commit()
    return {"ok": True}

@router.patch("/api/notifications/read-all")
def mark_all_read(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    db.query(models.Notification).filter(
        models.Notification.user_id == user.id, models.Notification.is_read == False
    ).update({"is_read": True})
    db.commit()
    return {"ok": True}

# ─── APPROVAL ACTIONS ─────────────────────────────────────────────────────────
def _apply_treasury_effect(db: Session, txn: "models.Transaction") -> None:
    """Mutate FundsInHandEntry rows to reflect the approved transaction.

    INFLOW   credits txn.credited_to.
    OUTFLOW  debits  txn.credited_to.
    TRANSFER debits txn.transfer_from and credits txn.credited_to.
    """
    if txn.type not in (
        models.TransactionType.INFLOW,
        models.TransactionType.OUTFLOW,
        models.TransactionType.TRANSFER,
    ):
        return

    now = datetime.utcnow()
    period = date(now.year, now.month, 1)

    # Carry forward latest balances for any treasurer not yet present in the current period.
    latest_period = (
        db.query(func.max(models.FundsInHandEntry.period))
        .filter(models.FundsInHandEntry.period < period)
        .scalar()
    )
    if latest_period:
        previous_entries = (
            db.query(models.FundsInHandEntry)
            .filter(models.FundsInHandEntry.period == latest_period)
            .all()
        )
        for prev in previous_entries:
            exists = db.query(models.FundsInHandEntry).filter(
                models.FundsInHandEntry.period == period,
                models.FundsInHandEntry.person == prev.person,
            ).first()
            if not exists:
                db.add(models.FundsInHandEntry(period=period, person=prev.person, amount=prev.amount))
        db.flush()

    def _bump(person: str, delta: Decimal) -> None:
        entry = db.query(models.FundsInHandEntry).filter(
            models.FundsInHandEntry.period == period,
            models.FundsInHandEntry.person == person,
        ).first()
        if entry:
            entry.amount = entry.amount + delta
        else:
            db.add(models.FundsInHandEntry(period=period, person=person, amount=delta))

    if txn.type == models.TransactionType.INFLOW and txn.credited_to:
        _bump(txn.credited_to, txn.amount)
    elif txn.type == models.TransactionType.OUTFLOW and txn.credited_to:
        _bump(txn.credited_to, -txn.amount)
    elif txn.type == models.TransactionType.TRANSFER:
        if txn.transfer_from:
            _bump(txn.transfer_from, -txn.amount)
        if txn.credited_to:
            _bump(txn.credited_to, txn.amount)


def _reverse_treasury_effect(db: Session, txn: "models.Transaction") -> None:
    """Undo the balance changes applied by _apply_treasury_effect.

    INFLOW   debits txn.credited_to (reverse of credit).
    OUTFLOW  credits txn.credited_to (reverse of debit).
    TRANSFER credits txn.transfer_from and debits txn.credited_to.
    """
    if txn.type not in (
        models.TransactionType.INFLOW,
        models.TransactionType.OUTFLOW,
        models.TransactionType.TRANSFER,
    ):
        return

    now = datetime.utcnow()
    period = date(now.year, now.month, 1)

    def _bump(person: str, delta: Decimal) -> None:
        entry = db.query(models.FundsInHandEntry).filter(
            models.FundsInHandEntry.period == period,
            models.FundsInHandEntry.person == person,
        ).first()
        if entry:
            entry.amount = entry.amount + delta
        else:
            db.add(models.FundsInHandEntry(period=period, person=person, amount=delta))

    if txn.type == models.TransactionType.INFLOW and txn.credited_to:
        _bump(txn.credited_to, -txn.amount)
    elif txn.type == models.TransactionType.OUTFLOW and txn.credited_to:
        _bump(txn.credited_to, txn.amount)
    elif txn.type == models.TransactionType.TRANSFER:
        if txn.transfer_from:
            _bump(txn.transfer_from, txn.amount)
        if txn.credited_to:
            _bump(txn.credited_to, -txn.amount)


@router.post("/api/transactions/{txn_id}/approve", response_model=schemas.TransactionOut)
def approve_transaction(txn_id: int, db: Session = Depends(get_db),
                        user: models.User = Depends(require_super_admin)):
    txn = db.query(models.Transaction).filter(models.Transaction.id == txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if txn.status != models.TransactionStatus.pending:
        raise HTTPException(status_code=400, detail=f"Cannot approve: status is {txn.status.value}")
    if txn.credited_to and user.username != txn.credited_to:
        raise HTTPException(status_code=403, detail=f"Only {txn.credited_to} can approve this transaction.")

    txn.status = models.TransactionStatus.approved
    txn.approved_by_user_id = user.id
    txn.approved_at = datetime.utcnow()

    _apply_treasury_effect(db, txn)

    # Update occupant last_paid_month
    if txn.occupant_id and txn.category == models.TransactionCategory.maintenance:
        occupant = db.query(models.Occupant).filter(models.Occupant.id == txn.occupant_id).first()
        if occupant and (occupant.last_paid_month is None or txn.date > occupant.last_paid_month):
            occupant.last_paid_month = txn.date
            db.add(occupant)

    _audit(db, models.AuditAction.approved, "transaction", txn.id, user,
           {"credited_to": txn.credited_to, "transfer_from": txn.transfer_from, "amount": str(txn.amount)})

    # Notify the submitter
    if txn.submitted_by_user_id and txn.submitted_by_user_id != user.id:
        _notify(db, txn.submitted_by_user_id, "approved", "Receipt Approved",
                f"Receipt #{txn.receipt_no or txn.id} has been approved.", txn.id)

    # Clear and notify all superadmins
    db.query(models.Notification).filter(models.Notification.transaction_id == txn.id).update({"is_read": True})
    super_admins = db.query(models.User).filter(models.User.role == models.UserRole.super_admin).all()
    for sa in super_admins:
        _notify(db, sa.id, "info", "Transaction Approved", f"{user.username} approved receipt #{txn.receipt_no or txn.id}.", txn.id)

    db.commit()
    db.refresh(txn)
    return txn

@router.post("/api/transactions/{txn_id}/reject", response_model=schemas.TransactionOut)
def reject_transaction(txn_id: int, body: schemas.ApprovalAction,
                       db: Session = Depends(get_db), user: models.User = Depends(require_super_admin)):
    txn = db.query(models.Transaction).filter(models.Transaction.id == txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if txn.status != models.TransactionStatus.pending:
        raise HTTPException(status_code=400, detail=f"Cannot reject: status is {txn.status.value}")
    if txn.credited_to and user.username != txn.credited_to:
        raise HTTPException(status_code=403, detail=f"Only {txn.credited_to} can reject this transaction.")
    txn.status = models.TransactionStatus.rejected
    txn.rejection_reason = body.reason or ""
    txn.approved_by_user_id = user.id
    txn.approved_at = datetime.utcnow()
    _audit(db, models.AuditAction.rejected, "transaction", txn.id, user, {"reason": body.reason})
    if txn.submitted_by_user_id:
        _notify(db, txn.submitted_by_user_id, "rejected", "Receipt Rejected",
                f"Receipt #{txn.receipt_no or txn.id} was rejected. Reason: {body.reason or 'N/A'}", txn.id)

    # Clear and notify all superadmins
    db.query(models.Notification).filter(models.Notification.transaction_id == txn.id).update({"is_read": True})
    super_admins = db.query(models.User).filter(models.User.role == models.UserRole.super_admin).all()
    for sa in super_admins:
        _notify(db, sa.id, "info", "Transaction Rejected", f"{user.username} rejected receipt #{txn.receipt_no or txn.id}.", txn.id)

    db.commit()
    db.refresh(txn)
    return txn

@router.post("/api/transactions/{txn_id}/cancel", response_model=schemas.TransactionOut)
def cancel_transaction(txn_id: int, body: schemas.ApprovalAction,
                       db: Session = Depends(get_db), user: models.User = Depends(require_super_admin)):
    txn = db.query(models.Transaction).filter(models.Transaction.id == txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if txn.status == models.TransactionStatus.cancelled:
        raise HTTPException(status_code=400, detail="Already cancelled")
    if txn.credited_to and user.username != txn.credited_to and txn.status == models.TransactionStatus.pending:
        raise HTTPException(status_code=403, detail=f"Only {txn.credited_to} can cancel this pending transaction.")

    was_approved = txn.status == models.TransactionStatus.approved

    txn.status = models.TransactionStatus.cancelled
    txn.cancel_reason = body.reason or ""
    txn.cancelled_at = datetime.utcnow()

    # Reverse treasury effect if the transaction was previously approved
    if was_approved:
        _reverse_treasury_effect(db, txn)
        # Roll back last_paid_month for maintenance payments
        if txn.occupant_id and txn.category == models.TransactionCategory.maintenance:
            occupant = db.query(models.Occupant).filter(models.Occupant.id == txn.occupant_id).first()
            if occupant and occupant.last_paid_month and txn.date:
                # Find the most recent *other* approved maintenance payment for this occupant
                latest_other = (
                    db.query(func.max(models.Transaction.date))
                    .filter(
                        models.Transaction.occupant_id == txn.occupant_id,
                        models.Transaction.category == models.TransactionCategory.maintenance,
                        models.Transaction.status == models.TransactionStatus.approved,
                        models.Transaction.id != txn.id,
                    )
                    .scalar()
                )
                occupant.last_paid_month = latest_other
                db.add(occupant)

    _audit(db, models.AuditAction.cancelled, "transaction", txn.id, user,
           {"reason": body.reason, "treasury_reversed": was_approved})
    if txn.submitted_by_user_id:
        _notify(db, txn.submitted_by_user_id, "cancelled", "Transaction Cancelled",
                f"Transaction #{txn.id} was cancelled. Reason: {body.reason or 'N/A'}", txn.id)

    # Clear and notify all superadmins
    db.query(models.Notification).filter(models.Notification.transaction_id == txn.id).update({"is_read": True})
    super_admins = db.query(models.User).filter(models.User.role == models.UserRole.super_admin).all()
    for sa in super_admins:
        _notify(db, sa.id, "info", "Transaction Cancelled", f"{user.username} cancelled receipt #{txn.receipt_no or txn.id}.", txn.id)

    db.commit()
    db.refresh(txn)
    return txn

# ─── AUDIT LOGS ───────────────────────────────────────────────────────────────
@router.get("/api/audit-logs", response_model=List[schemas.AuditLogOut])
def get_audit_logs(db: Session = Depends(get_db), user: models.User = Depends(require_super_admin),
                   limit: int = Query(default=100, ge=1, le=500),
                   offset: int = Query(default=0, ge=0),
                   action: Optional[str] = Query(default=None),
                   actor: Optional[str] = Query(default=None),
                   date_from: Optional[date] = Query(default=None),
                   date_to: Optional[date] = Query(default=None)):
    q = db.query(models.AuditLog)
    if action:
        q = q.filter(models.AuditLog.action == action)
    if actor:
        q = q.filter(models.AuditLog.performed_by_username.ilike(f"%{actor}%"))
    if date_from:
        q = q.filter(models.AuditLog.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.filter(models.AuditLog.created_at <= datetime.combine(date_to, datetime.max.time()))
    return q.order_by(models.AuditLog.created_at.desc()).offset(offset).limit(limit).all()

# ─── UNPAID MONTHS ────────────────────────────────────────────────────────────
@router.get("/api/tenants/{occupant_id}/unpaid-months", response_model=schemas.UnpaidMonthsOut)
def get_unpaid_months(occupant_id: int, db: Session = Depends(get_db),
                      user: models.User = Depends(get_current_user)):
    occupant = db.query(models.Occupant).options(joinedload(models.Occupant.unit)).filter(models.Occupant.id == occupant_id).first()
    if not occupant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    unpaid = _get_unpaid_months(occupant)
    month_names = ["", "January", "February", "March", "April", "May", "June",
                   "July", "August", "September", "October", "November", "December"]
    now = datetime.now()
    result = []
    for d in unpaid:
        key = f"{d.year}-{d.month:02d}"
        is_due = (d.year < now.year) or (d.year == now.year and d.month <= now.month)
        result.append(schemas.UnpaidMonth(
            month_key=key,
            label=f"{month_names[d.month]} {d.year}",
            year=d.year,
            is_due=is_due,
        ))
    return schemas.UnpaidMonthsOut(months=result)

# ─── DUES-FIRST MULTI-MONTH RECEIPT ──────────────────────────────────────────
@router.post("/api/receipts", response_model=schemas.ReceiptOut, status_code=201)
@router.post("/api/receipts/v2", response_model=schemas.ReceiptOut, status_code=201)
def create_receipt_v2(payload: schemas.ReceiptCreate, db: Session = Depends(get_db),
                      user: models.User = Depends(require_admin)):
    occupant = db.query(models.Occupant).filter(models.Occupant.id == payload.occupant_id).first()
    if not occupant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if payload.credited_to not in TREASURER_HOLDERS:
        raise HTTPException(status_code=400, detail=f"Invalid treasurer. Must be one of: {TREASURER_HOLDERS}")
    if not payload.months:
        raise HTTPException(status_code=400, detail="At least one month must be selected")

    # Parse and sort selected months
    selected = []
    for m in payload.months:
        parts = m.split("-")
        if len(parts) != 2:
            raise HTTPException(status_code=400, detail=f"Invalid month format: {m}. Use YYYY-MM")
        try:
            selected.append(date(int(parts[0]), int(parts[1]), 1))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid month: {m}")
    selected = sorted(set(selected))

    # Get unpaid months
    unpaid = _get_unpaid_months(occupant)
    has_dues = len(unpaid) > 0

    if has_dues:
        earliest_unpaid = unpaid[0]
        selected_set = set(selected)
        if earliest_unpaid not in selected_set:
            mn = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
            raise HTTPException(
                status_code=400,
                detail=f"Must include earliest unpaid month ({mn[earliest_unpaid.month]} {earliest_unpaid.year}) first",
            )
        latest_selected = selected[-1]

        required = []
        cursor = earliest_unpaid
        while cursor <= latest_selected:
            required.append(cursor)
            if cursor.month == 12:
                cursor = date(cursor.year + 1, 1, 1)
            else:
                cursor = date(cursor.year, cursor.month + 1, 1)

        if set(required) != selected_set:
            raise HTTPException(
                status_code=400,
                detail="Cannot skip months. Select a contiguous range starting from earliest unpaid month.",
            )
    else:
        # No dues — advance payment allowed for any future months
        now = datetime.now()
        current = date(now.year, now.month, 1)
        for s in selected:
            if occupant.last_paid_month:
                paid_through = date(occupant.last_paid_month.year, occupant.last_paid_month.month, 1)
                if s <= paid_through:
                    raise HTTPException(status_code=400, detail=f"Month {s.year}-{s.month:02d} is already paid")
            if s < current:
                raise HTTPException(status_code=400, detail=f"Past month {s.year}-{s.month:02d} cannot be selected")

    # Create transaction
    month_labels = ", ".join(f"{s.year}-{s.month:02d}" for s in selected)
    receipt_no = f"RCPT-{selected[0].year}{selected[0].month:02d}-{payload.occupant_id}-{int(datetime.utcnow().timestamp())}"
    unit_label = occupant.unit.unit_no if occupant.unit else str(occupant.unit_id or "")
    latest_month = selected[-1]

    is_super = user.role == models.UserRole.super_admin
    db_txn = models.Transaction(
        occupant_id=payload.occupant_id,
        receipt_no=receipt_no,
        date=datetime(latest_month.year, latest_month.month, 1),
        amount=payload.amount,
        type=models.TransactionType.INFLOW,
        category=models.TransactionCategory.maintenance,
        notes=f"Maintenance for {month_labels} ({unit_label})",
        generated_by=payload.generated_by or user.username,
        created_at=datetime.utcnow(),
        status=models.TransactionStatus.approved if is_super else models.TransactionStatus.pending,
        submitted_by_user_id=user.id,
        approved_by_user_id=user.id if is_super else None,
        approved_at=datetime.utcnow() if is_super else None,
        credited_to=payload.credited_to,
        payment_mode=payload.payment_mode,
    )
    db.add(db_txn)
    db.flush()

    if is_super:
        # Super-admin receipts skip the approval queue: log straight into inflow,
        # credit the treasurer, and advance last_paid_month immediately.
        _apply_treasury_effect(db, db_txn)
        if occupant and (occupant.last_paid_month is None or db_txn.date > occupant.last_paid_month):
            occupant.last_paid_month = db_txn.date
            db.add(occupant)
        _audit(db, models.AuditAction.created, "transaction", db_txn.id, user,
               {"months": month_labels, "amount": str(payload.amount), "credited_to": payload.credited_to,
                "auto_approved": True})
        _audit(db, models.AuditAction.approved, "transaction", db_txn.id, user,
               {"credited_to": payload.credited_to, "amount": str(payload.amount), "source": "super_admin_direct"})
    else:
        _audit(db, models.AuditAction.created, "transaction", db_txn.id, user,
               {"months": month_labels, "amount": str(payload.amount), "credited_to": payload.credited_to})

        # Notify all super admins
        super_admins = db.query(models.User).filter(models.User.role == models.UserRole.super_admin).all()
        for sa in super_admins:
            msg = f"{user.username} submitted receipt for {unit_label} — {month_labels} (₨{payload.amount})"
            if sa.username == payload.credited_to:
                _notify(db, sa.id, "approval_request", "Action Required: Pending Approval", msg, db_txn.id)
            else:
                _notify(db, sa.id, "info", f"Pending Approval for {payload.credited_to}", msg, db_txn.id)

    db.commit()
    db.refresh(db_txn)
    return schemas.ReceiptOut(id=db_txn.id, receipt_no=receipt_no, status=db_txn.status)


# ─── AUTO-ALLOCATE PAYMENT ───────────────────────────────────────────────────
@router.post("/api/receipts/auto-allocate", response_model=schemas.AutoAllocateResult, status_code=201)
def auto_allocate_payment(payload: schemas.AutoAllocateRequest, db: Session = Depends(get_db),
                          user: models.User = Depends(require_admin)):
    """Accept an amount and automatically allocate it against oldest unpaid months first,
    then advance months. Returns which months were covered and any remainder."""
    occupant = db.query(models.Occupant).filter(models.Occupant.id == payload.occupant_id).first()
    if not occupant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if payload.credited_to not in TREASURER_HOLDERS:
        raise HTTPException(status_code=400, detail=f"Invalid treasurer. Must be one of: {TREASURER_HOLDERS}")
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    extra_cars = max(0, int(occupant.car_count or 1) - 1)
    extra_fee = occupant.extra_car_maintenance_fee or Decimal("0.00")
    base_fee = occupant.monthly_maintenance_fee or Decimal("0.00")
    monthly_fee = base_fee + (extra_fee * extra_cars)

    if monthly_fee <= 0:
        raise HTTPException(status_code=400, detail="Monthly fee is zero — cannot allocate")

    # Build list of months to cover: unpaid first, then future
    unpaid = _get_unpaid_months(occupant)
    remaining = payload.amount
    months_covered: list[schemas.AllocatedMonth] = []
    month_names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    # Cover unpaid months first
    for m in unpaid:
        if remaining < monthly_fee:
            break
        months_covered.append(schemas.AllocatedMonth(
            month_key=f"{m.year}-{m.month:02d}",
            label=f"{month_names[m.month]} {m.year}",
            amount=monthly_fee,
        ))
        remaining -= monthly_fee

    # If all dues cleared, cover future months with remainder
    if not unpaid or len(months_covered) >= len(unpaid):
        # Start from month after last covered or current month
        if months_covered:
            parts = months_covered[-1].month_key.split("-")
            last_y, last_m = int(parts[0]), int(parts[1])
        elif occupant.last_paid_month:
            last_y = occupant.last_paid_month.year
            last_m = occupant.last_paid_month.month
        else:
            now = datetime.now()
            last_y, last_m = now.year, now.month - 1
            if last_m == 0:
                last_y -= 1
                last_m = 12

        cursor_m = last_m + 1
        cursor_y = last_y
        if cursor_m > 12:
            cursor_m = 1
            cursor_y += 1

        while remaining >= monthly_fee:
            months_covered.append(schemas.AllocatedMonth(
                month_key=f"{cursor_y}-{cursor_m:02d}",
                label=f"{month_names[cursor_m]} {cursor_y}",
                amount=monthly_fee,
            ))
            remaining -= monthly_fee
            cursor_m += 1
            if cursor_m > 12:
                cursor_m = 1
                cursor_y += 1

    if not months_covered:
        raise HTTPException(status_code=400, detail=f"Amount ₨{payload.amount} is less than one month's fee ₨{monthly_fee}")

    # Create the transaction using the same logic as create_receipt_v2
    month_keys = [mc.month_key for mc in months_covered]
    month_labels = ", ".join(month_keys)
    selected_dates = [date(int(k.split("-")[0]), int(k.split("-")[1]), 1) for k in month_keys]
    latest_month = selected_dates[-1]
    total_applied = sum(mc.amount for mc in months_covered)

    receipt_no = f"RCPT-{selected_dates[0].year}{selected_dates[0].month:02d}-{payload.occupant_id}-{int(datetime.utcnow().timestamp())}"
    unit_label = occupant.unit.unit_no if occupant.unit else str(occupant.unit_id or "")

    is_super = user.role == models.UserRole.super_admin
    db_txn = models.Transaction(
        occupant_id=payload.occupant_id,
        receipt_no=receipt_no,
        date=datetime(latest_month.year, latest_month.month, 1),
        amount=total_applied,
        type=models.TransactionType.INFLOW,
        category=models.TransactionCategory.maintenance,
        notes=f"Auto-allocated maintenance for {month_labels} ({unit_label})",
        generated_by=payload.generated_by or user.username,
        created_at=datetime.utcnow(),
        status=models.TransactionStatus.approved if is_super else models.TransactionStatus.pending,
        submitted_by_user_id=user.id,
        approved_by_user_id=user.id if is_super else None,
        approved_at=datetime.utcnow() if is_super else None,
        credited_to=payload.credited_to,
        payment_mode=payload.payment_mode,
    )
    db.add(db_txn)
    db.flush()

    if is_super:
        _apply_treasury_effect(db, db_txn)
        if occupant.last_paid_month is None or db_txn.date > occupant.last_paid_month:
            occupant.last_paid_month = db_txn.date
            db.add(occupant)
        _audit(db, models.AuditAction.created, "transaction", db_txn.id, user,
               {"months": month_labels, "amount": str(total_applied), "auto_allocated": True})
        _audit(db, models.AuditAction.approved, "transaction", db_txn.id, user,
               {"credited_to": payload.credited_to, "amount": str(total_applied), "source": "auto_allocate"})
    else:
        _audit(db, models.AuditAction.created, "transaction", db_txn.id, user,
               {"months": month_labels, "amount": str(total_applied), "auto_allocated": True})
        super_admins = db.query(models.User).filter(models.User.role == models.UserRole.super_admin).all()
        for sa in super_admins:
            msg = f"{user.username} submitted auto-allocated receipt for {unit_label} — {month_labels} (₨{total_applied})"
            if sa.username == payload.credited_to:
                _notify(db, sa.id, "approval_request", "Action Required: Pending Approval", msg, db_txn.id)
            else:
                _notify(db, sa.id, "info", f"Pending Approval for {payload.credited_to}", msg, db_txn.id)

    db.commit()
    db.refresh(db_txn)

    return schemas.AutoAllocateResult(
        id=db_txn.id,
        receipt_no=receipt_no,
        status=db_txn.status.value,
        months_covered=months_covered,
        total_applied=total_applied,
        remainder=remaining,
    )


# ─── SUPERADMIN CRUD OPERATIONS ───────────────────────────────────────────────
@router.put("/api/transactions/{txn_id}", response_model=schemas.TransactionOut)
def update_transaction(txn_id: int, payload: schemas.TransactionCreate,
                       db: Session = Depends(get_db), user: models.User = Depends(require_super_admin)):
    txn = db.query(models.Transaction).filter(models.Transaction.id == txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
        
    was_approved = txn.status == models.TransactionStatus.approved

    if was_approved:
        _reverse_treasury_effect(db, txn)
        
    old_amount = txn.amount
    
    # Update fields
    txn.amount = payload.amount
    txn.type = payload.type
    txn.category = payload.category
    txn.notes = payload.notes
    txn.expense_description = payload.expense_description
    txn.expense_details = payload.expense_details
    txn.credited_to = payload.credited_to
    txn.transfer_from = payload.transfer_from
    if payload.date:
        txn.date = payload.date
        
    if was_approved:
        _apply_treasury_effect(db, txn)
        
    _audit(db, models.AuditAction.verified, "transaction", txn.id, user, 
           {"event": "edited", "old_amount": str(old_amount), "new_amount": str(txn.amount)})
           
    db.commit()
    db.refresh(txn)
    return txn

@router.delete("/api/transactions/{txn_id}")
def delete_transaction(txn_id: int, db: Session = Depends(get_db), 
                       user: models.User = Depends(require_super_admin)):
    txn = db.query(models.Transaction).filter(models.Transaction.id == txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
        
    if txn.status == models.TransactionStatus.approved:
        _reverse_treasury_effect(db, txn)
        
    # Also fix occupant last_paid_month if it was a maintenance receipt
    if txn.occupant_id and txn.category == models.TransactionCategory.maintenance and txn.status == models.TransactionStatus.approved:
        occupant = db.query(models.Occupant).filter(models.Occupant.id == txn.occupant_id).first()
        if occupant and occupant.last_paid_month and txn.date:
            from sqlalchemy import func
            latest_other = (
                db.query(func.max(models.Transaction.date))
                .filter(
                    models.Transaction.occupant_id == txn.occupant_id,
                    models.Transaction.category == models.TransactionCategory.maintenance,
                    models.Transaction.status == models.TransactionStatus.approved,
                    models.Transaction.id != txn.id,
                )
                .scalar()
            )
            occupant.last_paid_month = latest_other
            db.add(occupant)
            
    db.delete(txn)
    _audit(db, models.AuditAction.cancelled, "transaction", txn_id, user, {"event": "deleted", "amount": str(txn.amount)})
    db.commit()
    return {"ok": True, "message": "Transaction deleted successfully"}


# ─── PDF RECEIPT (HTML for print/PDF) ────────────────────────────────────────
def _fmt_pkr(amount) -> str:
    try:
        return f"₨ {int(Decimal(str(amount))):,}"
    except Exception:
        return str(amount)


def _fmt_date(dt) -> str:
    if not dt:
        return "—"
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt)
        except Exception:
            return dt
    if getattr(dt, "tzinfo", None) is None:
        dt = dt + timedelta(hours=5)
    return dt.strftime("%d %b %Y, %I:%M %p")


@router.get("/api/receipts/{txn_id}/pdf", response_class=HTMLResponse)
def get_receipt_pdf(
    txn_id: int,
    token: Optional[str] = Query(default=None),
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    """Return a print-ready HTML receipt. Accepts auth via Bearer header or ?token= query param."""
    from jose import JWTError, jwt as jose_jwt
    try:
        from backend.auth import SECRET_KEY, ALGORITHM
    except ImportError:
        from auth import SECRET_KEY, ALGORITHM

    # Try Bearer header first, fall back to query param
    auth_token = token
    if authorization and authorization.lower().startswith("bearer "):
        auth_token = authorization.split(" ", 1)[1].strip()

    user = None
    try:
        if auth_token:
            payload = jose_jwt.decode(auth_token, SECRET_KEY, algorithms=[ALGORITHM])
            username = payload.get("sub")
            if username:
                user = db.query(models.User).filter(models.User.username == username).first()
    except Exception:
        pass

    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    """Return a print-ready HTML receipt for the given transaction."""
    txn = db.query(models.Transaction).filter(models.Transaction.id == txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    occupant = None
    occupant_name = "General"
    unit_no = "—"
    if txn.occupant_id:
        occupant = db.query(models.Occupant).filter(models.Occupant.id == txn.occupant_id).first()
        if occupant:
            occupant_name = occupant.name
            unit_no = occupant.unit.unit_no if occupant.unit else "—"

    clean_ref = str(txn.receipt_no or f"TXN-{txn.id}").strip()
    status_label = txn.status.value.upper() if hasattr(txn.status, "value") else str(txn.status).upper()
    approved_by_name = ""
    if txn.approved_by_user_id:
        approver = db.query(models.User).filter(models.User.id == txn.approved_by_user_id).first()
        approved_by_name = approver.username if approver else ""

    category_label = txn.category.value.replace("_", " ").title() if hasattr(txn.category, "value") else str(txn.category)
    type_label = txn.type.value if hasattr(txn.type, "value") else str(txn.type)
    payment_mode_label = (txn.payment_mode or "—").replace("_", " ").title()

    # Extract months from notes if available
    months_adjusted = "—"
    if txn.notes and "Maintenance for" in txn.notes:
        months_adjusted = txn.notes.split("Maintenance for")[-1].strip().split("(")[0].strip()
    elif txn.notes and "Auto-allocated maintenance for" in txn.notes:
        months_adjusted = txn.notes.split("Auto-allocated maintenance for")[-1].strip().split("(")[0].strip()

    stamp_color = "#16a34a" if status_label == "APPROVED" else "#eab308" if status_label == "PENDING" else "#dc2626"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Anum Vista Maintenance Receipt</title>
<style>
  @page {{ size: A4; margin: 18mm; }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; padding: 40px; max-width: 800px; margin: 0 auto; }}
  .header {{ display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1e293b; padding-bottom: 16px; margin-bottom: 24px; }}
  .header h1 {{ font-size: 28px; color: #1e293b; }}
  .header .subtitle {{ color: #64748b; font-size: 13px; margin-top: 4px; }}
  .receipt-ref {{ text-align: right; }}
  .receipt-ref .label {{ color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }}
  .receipt-ref .value {{ font-family: 'Courier New', monospace; font-size: 14px; font-weight: 700; margin-top: 2px; }}
  .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }}
  .field {{ padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }}
  .field .label {{ color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }}
  .field .value {{ font-weight: 600; margin-top: 4px; font-size: 14px; }}
  .field.full {{ grid-column: 1 / -1; }}
  .amount-box {{ margin: 24px 0; padding: 24px; border: 3px solid #16a34a; border-radius: 12px; text-align: center; background: #f0fdf4; }}
  .amount-box .label {{ color: #16a34a; font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; }}
  .amount-box .amount {{ font-size: 36px; font-weight: 800; color: #16a34a; margin-top: 6px; }}
  .stamp {{ display: inline-block; margin-top: 24px; padding: 10px 20px; border: 2px solid {stamp_color}; color: {stamp_color}; font-weight: 800; font-size: 14px; letter-spacing: 0.15em; border-radius: 8px; text-transform: uppercase; }}
  .footer {{ margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }}
  @media print {{
    body {{ padding: 0; }}
    .no-print {{ display: none; }}
  }}
</style>
</head>
<body>
  <div class="no-print" style="margin-bottom:20px; text-align:right;">
    <button onclick="window.print()" style="padding:8px 20px; background:#1e293b; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:600;">Print / Save as PDF</button>
  </div>

  <div class="header">
    <div>
      <h1>Anum Vista</h1>
      <p class="subtitle">Property Management — Maintenance Receipt</p>
    </div>
    <div class="receipt-ref">
      <div class="label">Receipt #</div>
      <div class="value">{clean_ref}</div>
      <div style="margin-top:8px;">
        <div class="label">Date & Time</div>
        <div class="value" style="font-size:12px;">{_fmt_date(txn.created_at or txn.date)}</div>
      </div>
    </div>
  </div>

  <div class="grid">
    <div class="field">
      <div class="label">Apartment Number</div>
      <div class="value">{unit_no}</div>
    </div>
    <div class="field">
      <div class="label">Resident Name</div>
      <div class="value">{occupant_name}</div>
    </div>
    <div class="field">
      <div class="label">Category</div>
      <div class="value">{category_label}</div>
    </div>
    <div class="field">
      <div class="label">Transaction Type</div>
      <div class="value">{type_label}</div>
    </div>
    <div class="field">
      <div class="label">Payment Mode</div>
      <div class="value">{payment_mode_label}</div>
    </div>
    <div class="field">
      <div class="label">Received By (Treasurer)</div>
      <div class="value">{txn.credited_to or '—'}</div>
    </div>
    <div class="field full">
      <div class="label">Months Adjusted</div>
      <div class="value">{months_adjusted}</div>
    </div>
    <div class="field">
      <div class="label">Generated By</div>
      <div class="value">{txn.generated_by or 'System'}</div>
    </div>
    <div class="field">
      <div class="label">Approval Status</div>
      <div class="value" style="color:{stamp_color};">{status_label}</div>
    </div>
    <div class="field">
      <div class="label">Approved By</div>
      <div class="value">{approved_by_name or '—'}</div>
    </div>
    <div class="field">
      <div class="label">Approved At</div>
      <div class="value">{_fmt_date(txn.approved_at)}</div>
    </div>
    <div class="field full">
      <div class="label">Notes / Remarks</div>
      <div class="value">{txn.notes or '—'}</div>
    </div>
  </div>

  <div class="amount-box">
    <div class="label">Amount Paid</div>
    <div class="amount">{_fmt_pkr(txn.amount)}</div>
  </div>

  <div class="stamp">{status_label}</div>

  <div class="footer">
    <div>Anum Vista Property Management System</div>
    <div>Official Verified Record</div>
  </div>
</body>
</html>"""
    return HTMLResponse(content=html)
