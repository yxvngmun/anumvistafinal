export type DecimalString = string;
export type TenantStatus = "Overdue" | "Settled";

export type TransactionType = "INFLOW" | "OUTFLOW" | "TRANSFER";

export type TransactionCategory =
  | "maintenance"
  | "expense"
  | "ad_revenue"
  | "other";

export interface DashboardMetricsResponse {
  total_revenue: DecimalString;
  treasury_balance: DecimalString;
  total_overdues: DecimalString;
  ad_revenue: DecimalString;
  total_apartments: number;
  advance_payments: DecimalString;
  pending_approvals: number;
}

export interface Unit {
  id: number;
  unit_no: string;
  type: string;
  is_rental: boolean;
  owner_name?: string | null;
  owner_contact?: string | null;
}

export interface Occupant {
  id: number;
  name: string;
  cnic?: string | null;
  contact?: string | null;
  phone?: string | null;
  email?: string | null;
  monthly_maintenance_fee: DecimalString;
  car_count?: number;
  extra_car_maintenance_fee?: DecimalString;
  extra_car_charges?: DecimalString;
  total_monthly_maintenance?: DecimalString;
  last_paid_month: string | null;
  due_month?: string | null;
  expected_dues: DecimalString;
  status?: string;
  residence_status?: "occupied" | "vacant";
  is_rental?: boolean;
  tenant_name?: string | null;
  tenant_contact?: string | null;
  tenant_cnic?: string | null;
  hasPastDues?: boolean;
  unpaidPastMonths?: string[];
  paidMonths?: string[];
  paid_months?: string[];
  unit: Unit;
}

export interface Transaction {
  id: number;
  occupant_id: number | null;
  receipt_no: string | null;
  date: string;
  amount: DecimalString;
  type: TransactionType;
  category: TransactionCategory;
  notes: string | null;
  expense_description?: string | null;
  expense_details?: string | null;
  maintenance_month?: string | null;
  maintenanceMonth?: string | null;
  created_at?: string | null;
  timestamp?: string | null;
  generated_by?: string | null;
  generatedBy?: string | null;
  source?: string | null;
  status?: "pending" | "approved" | "rejected" | "cancelled" | "restored";
  submitted_by_user_id?: number | null;
  approved_by_user_id?: number | null;
  approved_at?: string | null;
  rejection_reason?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  credited_to?: string | null;
  transfer_from?: string | null;
  payment_mode?: string | null;
  extra_source_id?: number | null;
  extra_source_name?: string | null;
  billing_cycle?: string | null;
  period_label?: string | null;
  restored_at?: string | null;
  restored_by_user_id?: number | null;
  restore_reason?: string | null;
}

export interface ExtraCurricularSourceSummary {
  id: number;
  code: string;
  name: string;
  source_type: "community_hall" | "advert" | "other" | string;
  billing_cycle: "quarterly" | "half_yearly" | "yearly" | "one_time" | string;
  annual_fixed_amount: DecimalString;
  monthly_target: DecimalString;
  total_received: DecimalString;
  received_per_month: DecimalString;
  remaining_annual: DecimalString;
  remaining_per_month: DecimalString;
  pending_amount: DecimalString;
  transaction_count: number;
}

export interface ExtraCurricularOverviewResponse {
  year: number;
  sources: ExtraCurricularSourceSummary[];
  transactions: Transaction[];
}

export interface ExtraCurricularCollectPayload {
  source_id?: number;
  source_code?: string;
  custom_source_name?: string;
  amount: string;
  date: string;
  billing_cycle: "quarterly" | "half_yearly" | "yearly" | "one_time";
  period_label?: string;
  credited_to: string;
  payment_mode?: string;
  generated_by?: string;
  notes?: string;
}

export interface ExtraCurricularSourceUpdatePayload {
  name?: string;
  billing_cycle?: "quarterly" | "half_yearly" | "yearly" | "one_time";
  annual_fixed_amount?: string;
}

export type PaymentMode = "cash" | "bank_transfer" | "cheque" | "online" | "other";

export interface CreateTransactionPayload {
  date: string;
  amount: DecimalString;
  type: TransactionType;
  category: TransactionCategory;
  occupant_id?: number;
  notes?: string;
  generated_by?: "Naveed" | "Dilshad" | "System";
  expense_description?: string;
  expense_details?: string;
  credited_to?: string;
  transfer_from?: string;
  payment_mode?: string;
}

export interface ExpenseDescription {
  id?: number;
  label: string;
  description?: string;
}

export interface TreasuryHolder {
  name: string;
  amount: DecimalString;
}

export interface TreasuryCurrentResponse {
  period: string | null;
  holders: TreasuryHolder[];
}

export interface MonthlyTransactionLine {
  id: number;
  date: string;
  type: TransactionType;
  category: string;
  amount: DecimalString;
  receipt_no?: string | null;
  occupant_name?: string | null;
  unit_no?: string | null;
  notes?: string | null;
  expense_description?: string | null;
  expense_details?: string | null;
  generated_by?: string | null;
  credited_to?: string | null;
  transfer_from?: string | null;
  payment_mode?: string | null;
  status: string;
}

export interface TreasurerSplitEntry {
  person: string;
  amount: DecimalString;
}

export interface MonthlyReportResponse {
  year: number;
  month: number;
  maintenance_received: DecimalString;
  inflow_total: DecimalString;
  outflow_total: DecimalString;
  transfer_total: DecimalString;
  net_flow?: DecimalString;
  treasury_opening?: DecimalString | null;
  treasury_closing?: DecimalString | null;
  inflow_by_category: Record<string, DecimalString>;
  outflow_by_category: Record<string, DecimalString>;
  inflow_by_treasurer?: Record<string, DecimalString>;
  outflow_by_treasurer?: Record<string, DecimalString>;
  transactions?: MonthlyTransactionLine[];
  treasurer_split?: TreasurerSplitEntry[];
}

/**
 * Decimal values from the API are strings; convert before arithmetic.
 */
export const parseDecimal = (value: DecimalString): number => {
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

/**
 * Derives whether a tenant is overdue based on last paid month (YYYY-MM).
 */
export const isOverdueFromLastPaidMonth = (
  lastPaidMonth: string | null,
  referenceDate: Date = new Date(),
): boolean => {
  if (!lastPaidMonth) return true;

  const [yearStr, monthStr] = lastPaidMonth.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || !month || month < 1 || month > 12) return true;

  const paidThrough = new Date(year, month - 1, 1);
  const currentMonth = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    1,
  );

  return paidThrough < currentMonth;
};
