from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
from decimal import Decimal
try:
    from backend.models import UnitType, TransactionType, TransactionCategory, UserRole, TransactionStatus, AuditAction, PaymentMode
except ImportError:
    from models import UnitType, TransactionType, TransactionCategory, UserRole, TransactionStatus, AuditAction, PaymentMode

# --- Auth & Users ---
class LoginRequest(BaseModel):
    username: str
    password: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    role: str

class UserOut(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    role: UserRole

    class Config:
        from_attributes = True

# --- Units ---
class UnitBase(BaseModel):
    unit_no: str
    type: UnitType
    owner_name: Optional[str] = None
    owner_contact: Optional[str] = None
    is_rental: bool = False

class UnitOut(UnitBase):
    id: int

    class Config:
        from_attributes = True

# --- Occupants ---
class OccupantBase(BaseModel):
    name: str
    monthly_maintenance_fee: Decimal
    cnic: Optional[str] = None
    contact: Optional[str] = None
    car_count: int = 1
    extra_car_maintenance_fee: Decimal = Decimal('0.00')
    status: str = "occupied"

class OccupantOut(OccupantBase):
    id: int
    unit: UnitOut
    last_paid_month: Optional[datetime] = None
    expected_dues: Decimal = Decimal('0.00') # Dynamically calculated field
    extra_cars: int = 0
    extra_car_charges: Decimal = Decimal('0.00')
    total_monthly_maintenance: Decimal = Decimal('0.00')

    class Config:
        from_attributes = True

# --- Transactions ---
class TransactionCreate(BaseModel):
    occupant_id: Optional[int] = None
    receipt_no: Optional[str] = None
    date: datetime
    amount: Decimal
    type: TransactionType
    category: TransactionCategory
    notes: Optional[str] = None
    expense_description: Optional[str] = None
    expense_details: Optional[str] = None
    generated_by: Optional[str] = None
    credited_to: Optional[str] = None
    transfer_from: Optional[str] = None
    payment_mode: Optional[str] = None

class TransactionOut(TransactionCreate):
    id: int
    created_at: Optional[datetime] = None
    status: TransactionStatus
    submitted_by_user_id: Optional[int] = None
    approved_by_user_id: Optional[int] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    cancel_reason: Optional[str] = None

    class Config:
        from_attributes = True

# --- Approvals ---
class ApprovalAction(BaseModel):
    action: str  # "approve", "reject", "cancel"
    reason: Optional[str] = None

# --- Notifications ---
class NotificationOut(BaseModel):
    id: int
    user_id: int
    type: str
    title: str
    message: str
    transaction_id: Optional[int] = None
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True

class NotificationCount(BaseModel):
    unread_count: int

# --- Audit Logs ---
class AuditLogOut(BaseModel):
    id: int
    action: AuditAction
    entity_type: str
    entity_id: Optional[int] = None
    performed_by_user_id: Optional[int] = None
    performed_by_username: Optional[str] = None
    details: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

# --- Dashboard Metrics ---
class DashboardMetrics(BaseModel):
    total_revenue: Decimal
    treasury_balance: Decimal
    total_overdues: Decimal
    ad_revenue: Decimal
    total_apartments: int = 0
    advance_payments: Decimal = Decimal("0.00")
    pending_approvals: int = 0


class FundsPositionEntryOut(BaseModel):
    period: date
    section: str
    label: str
    amount: Decimal

    class Config:
        from_attributes = True


class FundsInHandEntryOut(BaseModel):
    period: date
    person: str
    amount: Decimal

    class Config:
        from_attributes = True


class OutstandingMaintenanceSnapshotOut(BaseModel):
    as_of: date
    unit_no: str
    resident_name: str
    annual_maintenance: Decimal
    dues_till_dec_31: Decimal
    maintenance_till_period: Decimal
    received_during_year: Decimal
    dues_till_period: Decimal

    class Config:
        from_attributes = True


class OccupantStatusUpdate(BaseModel):
    status: str


class OccupantCarUpdate(BaseModel):
    car_count: int
    extra_car_maintenance_fee: Decimal = Decimal('2000.00')
    status: Optional[str] = "occupied"


class OccupantUpdate(BaseModel):
    name: str
    contact: Optional[str] = None
    cnic: Optional[str] = None
    status: Optional[str] = None


class ExpenseDescriptionOut(BaseModel):
    id: int
    description: str

    class Config:
        from_attributes = True


class MonthlyTransactionLine(BaseModel):
    id: int
    date: datetime
    type: str
    category: str
    amount: Decimal
    receipt_no: Optional[str] = None
    occupant_name: Optional[str] = None
    unit_no: Optional[str] = None
    notes: Optional[str] = None
    expense_description: Optional[str] = None
    expense_details: Optional[str] = None
    generated_by: Optional[str] = None
    credited_to: Optional[str] = None
    transfer_from: Optional[str] = None
    payment_mode: Optional[str] = None
    status: str


class TreasurerSplit(BaseModel):
    person: str
    amount: Decimal


class MonthlyReportOut(BaseModel):
    year: int
    month: int
    maintenance_received: Decimal
    inflow_total: Decimal
    outflow_total: Decimal
    transfer_total: Decimal
    net_flow: Decimal = Decimal("0.00")
    treasury_opening: Optional[Decimal] = None
    treasury_closing: Optional[Decimal] = None
    inflow_by_category: dict[str, Decimal]
    outflow_by_category: dict[str, Decimal]
    inflow_by_treasurer: dict[str, Decimal] = {}
    outflow_by_treasurer: dict[str, Decimal] = {}
    transactions: List[MonthlyTransactionLine] = []
    treasurer_split: List[TreasurerSplit] = []


class ReceiptCreate(BaseModel):
    occupant_id: int
    months: List[str]  # e.g., ["2026-05", "2026-06"]
    amount: Decimal
    generated_by: Optional[str] = None
    credited_to: str
    payment_mode: Optional[str] = None


class ReceiptOut(BaseModel):
    id: int
    receipt_no: str
    status: TransactionStatus

class UnpaidMonth(BaseModel):
    month_key: str
    label: str
    year: int
    is_due: bool

class UnpaidMonthsOut(BaseModel):
    months: List[UnpaidMonth]


class AutoAllocateRequest(BaseModel):
    occupant_id: int
    amount: Decimal
    credited_to: str
    generated_by: Optional[str] = None
    payment_mode: Optional[str] = None


class AllocatedMonth(BaseModel):
    month_key: str
    label: str
    amount: Decimal

class AutoAllocateResult(BaseModel):
    id: int
    receipt_no: str
    status: str
    months_covered: List[AllocatedMonth]
    total_applied: Decimal
    remainder: Decimal


# ─── Ledger ────────────────────────────────────────────────────────────
class LedgerEntry(BaseModel):
    month_key: str
    label: str
    status: str  # "paid", "pending", "advance", "partial"
    amount_due: Decimal
    amount_paid: Decimal
    transaction_ids: List[int] = []


class LedgerOut(BaseModel):
    occupant_id: int
    occupant_name: str
    unit_no: str
    monthly_fee: Decimal
    entries: List[LedgerEntry]


# ─── Reports ──────────────────────────────────────────────────────────
class PendingDuesReportEntry(BaseModel):
    occupant_id: int
    name: str
    unit_no: str
    monthly_fee: Decimal
    months_overdue: int
    total_due: Decimal
    last_paid_month: Optional[str] = None


class PendingDuesReport(BaseModel):
    as_of: str
    total_due: Decimal
    entries: List[PendingDuesReportEntry]


class AdvancePaymentEntry(BaseModel):
    occupant_id: int
    name: str
    unit_no: str
    paid_through: str
    months_ahead: int


class AdvancePaymentReport(BaseModel):
    as_of: str
    entries: List[AdvancePaymentEntry]


class ExpenseReportEntry(BaseModel):
    category: str
    description: Optional[str] = None
    total: Decimal
    count: int


class ExpenseReport(BaseModel):
    year: int
    month: int
    total_expenses: Decimal
    entries: List[ExpenseReportEntry]


class CashReconciliationReport(BaseModel):
    year: int
    month: int
    opening_balance: Optional[Decimal] = None
    total_inflow: Decimal
    total_outflow: Decimal
    total_transfer: Decimal
    net_flow: Decimal
    closing_balance: Optional[Decimal] = None
    by_treasurer: dict[str, Decimal]


# ─── Due Reminders ────────────────────────────────────────────────────
class DueReminderEntry(BaseModel):
    occupant_id: int
    name: str
    unit_no: str
    contact: Optional[str] = None
    monthly_fee: Decimal
    months_overdue: int
    total_due: Decimal
    unpaid_months: List[str]


class DueRemindersOut(BaseModel):
    generated_at: str
    total_residents_due: int
    entries: List[DueReminderEntry]
