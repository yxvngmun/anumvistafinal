import type {
  CreateTransactionPayload,
  DashboardMetricsResponse,
  ExpenseDescription,
  ExtraCurricularCollectPayload,
  ExtraCurricularOverviewResponse,
  ExtraCurricularSourceSummary,
  ExtraCurricularSourceUpdatePayload,
  MonthlyReportResponse,
  Occupant,
  TreasuryCurrentResponse,
  Transaction,
} from "./types";

const rawBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
const cleanBaseUrl = rawBaseUrl.replace(/\/+$/, "");
const API_BASE_URL = cleanBaseUrl.endsWith("/api") ? cleanBaseUrl : `${cleanBaseUrl}/api`;
const buildUrl = (path: string): string => {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
};

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("av_token");
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(buildUrl(path), {
    ...init,
    headers,
    cache: "no-store",
  });

  if (response.status === 401) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("av_token");
      localStorage.removeItem("av_role");
      window.location.href = "/login";
    }
    throw new Error("Session expired");
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `API request failed (${response.status} ${response.statusText}) for ${path}: ${text}`,
    );
  }

  if (!text || text.trim() === "") {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

const withQuery = (
  path: string,
  params?: Record<string, string | number | undefined>,
): string => {
  if (!params) return path;
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) query.set(key, String(value));
  });
  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
};

type TreasuryRawResponse = {
  period: string | null;
  holders:
    | Record<string, string>
    | Array<{ name: string; amount: string }>;
};

export interface NotificationItem {
  id: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  transaction_id: number | null;
  is_read: boolean;
  created_at: string;
}

export interface AuditLogItem {
  id: number;
  action: string;
  entity_type: string;
  entity_id: number | null;
  performed_by_user_id: number | null;
  performed_by_username: string | null;
  details: string | null;
  created_at: string;
}

export interface AuthUser {
  id: number;
  username: string;
  email: string | null;
  role: "admin" | "senior_admin" | "super_admin";
  permissions?: Record<string, boolean>;
}

export type RolePermissionsMap = Record<"senior_admin" | "admin", Record<string, boolean>>;

export const DEFAULT_ROLE_PERMISSIONS: Record<"admin" | "senior_admin" | "super_admin", Record<string, boolean>> = {
  super_admin: {
    overview: true,
    analytics: true,
    treasury: true,
    extra_curriculars: true,
    audit_trail: true,
    reports_ledger: true,
    residents: true,
    cars_parking: true,
    transactions: true,
  },
  senior_admin: {
    overview: true,
    analytics: true,
    treasury: true,
    extra_curriculars: true,
    audit_trail: false,
    reports_ledger: false,
    residents: true,
    cars_parking: true,
    transactions: true,
  },
  admin: {
    overview: false,
    analytics: false,
    treasury: false,
    extra_curriculars: false,
    audit_trail: false,
    reports_ledger: false,
    residents: true,
    cars_parking: true,
    transactions: true,
  },
};

export function hasPermission(user: AuthUser | null | undefined, key: string): boolean {
  if (!user) return false;
  if (user.role === "super_admin") return true;
  if (user.permissions && key in user.permissions) {
    return Boolean(user.permissions[key]);
  }
  return Boolean(DEFAULT_ROLE_PERMISSIONS[user.role]?.[key]);
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  role: "admin" | "senior_admin" | "super_admin";
}

export interface AuditLogFilters {
  action?: string;
  actor?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export interface UnpaidMonth {
  month_key: string;
  label: string;
  year: number;
  is_due: boolean;
  monthly_fee?: string;
  paid_amount?: string;
  remaining_amount?: string;
  is_partial?: boolean;
}

export interface ReceiptV2Payload {
  occupant_id: number;
  months: string[];
  amount: string;
  generated_by?: string;
  credited_to: string;
  payment_mode?: string;
}

export interface AutoAllocatePayload {
  occupant_id: number;
  amount: string;
  credited_to: string;
  generated_by?: string;
  payment_mode?: string;
}

export interface AllocatedMonth {
  month_key: string;
  label: string;
  amount: string;
}

export interface AutoAllocateResult {
  id: number;
  receipt_no: string;
  status: string;
  months_covered: AllocatedMonth[];
  total_applied: string;
  remainder: string;
}

export interface LedgerEntry {
  month_key: string;
  label: string;
  status: string;
  amount_due: string;
  amount_paid: string;
  transaction_ids: number[];
}

export interface LedgerOut {
  occupant_id: number;
  occupant_name: string;
  unit_no: string;
  monthly_fee: string;
  entries: LedgerEntry[];
}

export interface PendingDuesEntry {
  occupant_id: number;
  name: string;
  unit_no: string;
  monthly_fee: string;
  months_overdue: number;
  total_due: string;
  last_paid_month: string | null;
}

export interface PendingDuesReport {
  as_of: string;
  total_due: string;
  entries: PendingDuesEntry[];
}

export interface DueReminderEntry {
  occupant_id: number;
  name: string;
  unit_no: string;
  contact: string | null;
  monthly_fee: string;
  months_overdue: number;
  total_due: string;
  unpaid_months: string[];
}

export interface DueRemindersOut {
  generated_at: string;
  total_residents_due: number;
  entries: DueReminderEntry[];
}

export interface AdvancePaymentEntry {
  occupant_id: number;
  name: string;
  unit_no: string;
  paid_through: string;
  months_ahead: number;
}

export interface AdvancePaymentReport {
  as_of: string;
  entries: AdvancePaymentEntry[];
}

export interface ExpenseReportEntry {
  category: string;
  description: string | null;
  total: string;
  count: number;
}

export interface ExpenseReport {
  year: number;
  month: number;
  total_expenses: string;
  entries: ExpenseReportEntry[];
}

export interface CashReconciliationReport {
  year: number;
  month: number;
  opening_balance: string | null;
  total_inflow: string;
  total_outflow: string;
  total_transfer: string;
  net_flow: string;
  closing_balance: string | null;
  by_treasurer: Record<string, string>;
}

export interface WhatsAppSendPayload {
  occupant_id: number;
  phone: string;
  message: string;
}

export interface WhatsAppBulkPayload {
  entries: { occupant_id: number; phone: string; message: string }[];
}

export const api = {
  login: async (username: string, password: string): Promise<LoginResponse> => {
    const response = await fetch(buildUrl("/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      cache: "no-store",
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: "Login failed" }));
      throw new Error(err.detail || "Login failed");
    }
    const text = await response.text();
    return (text ? JSON.parse(text) : {}) as LoginResponse;
  },

  getMe: (): Promise<AuthUser> => fetchJson<AuthUser>("/auth/me"),

  changePassword: (current_password: string, new_password: string): Promise<{ ok: boolean; message: string }> =>
    fetchJson<{ ok: boolean; message: string }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password, new_password }),
    }),

  getDashboardMetrics: (month?: string, year?: string): Promise<DashboardMetricsResponse> =>
    fetchJson<DashboardMetricsResponse>(withQuery("/dashboard/metrics", { month, year })),

  getTenants: (): Promise<Occupant[]> => fetchJson<Occupant[]>("/tenants"),

  getTransactions: (status?: string, year?: number): Promise<Transaction[]> =>
    fetchJson<Transaction[]>(withQuery("/transactions", { status, year })),

  createTransaction: (payload: CreateTransactionPayload): Promise<Transaction> => {
    if (!payload.date.includes("T")) {
      throw new Error("Transaction date must be a full ISO datetime string.");
    }
    return fetchJson<Transaction>("/transactions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getMonthlyReport: (year: number, month: number): Promise<MonthlyReportResponse> =>
    fetchJson<MonthlyReportResponse>(withQuery("/reports/monthly", { year, month })),

  getTreasuryCurrent: async (): Promise<TreasuryCurrentResponse> => {
    const raw = await fetchJson<TreasuryRawResponse>("/treasury/current");
    const holders = Array.isArray(raw.holders)
      ? raw.holders
      : Object.entries(raw.holders ?? {}).map(([name, amount]) => ({ name, amount }));
    return { period: raw.period, holders };
  },

  getExpenseDescriptions: async (): Promise<ExpenseDescription[]> => {
    const raw = await fetchJson<Array<{ id?: number; description?: string; label?: string }>>(
      "/expense-descriptions",
    );
    return raw.map((item) => {
      const label = item.label ?? item.description ?? "";
      return { id: item.id, label, description: item.description };
    });
  },

  // ─── New governance endpoints ──────────────────────────────────────────
  getTreasurers: (): Promise<{
    treasurers: string[];
    operational_treasurers?: string[];
    maintenance_receiver?: string;
    advert_receiver?: string;
  }> =>
    fetchJson("/treasurers"),

  getUnpaidMonths: (occupantId: number): Promise<{
    monthly_fee?: string;
    partial_paid_amount?: string;
    total_overdue?: string;
    months: UnpaidMonth[];
  }> =>
    fetchJson(`/tenants/${occupantId}/unpaid-months`),

  createReceiptV2: (payload: ReceiptV2Payload): Promise<{ id: number; receipt_no: string; status: string }> =>
    fetchJson("/receipts", { method: "POST", body: JSON.stringify(payload) }),

  approveTransaction: (id: number): Promise<Transaction> =>
    fetchJson(`/transactions/${id}/approve`, { method: "POST", body: JSON.stringify({}) }),

  rejectTransaction: (id: number, reason?: string): Promise<Transaction> =>
    fetchJson(`/transactions/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ action: "reject", reason }),
    }),

  cancelTransaction: (id: number, reason?: string): Promise<Transaction> =>
    fetchJson(`/transactions/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ action: "cancel", reason }),
    }),

  restoreTransaction: (id: number, reason: string): Promise<Transaction> =>
    fetchJson<Transaction>(`/transactions/${id}/restore`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  getExtraCurriculars: (year = 2026): Promise<ExtraCurricularOverviewResponse> =>
    fetchJson<ExtraCurricularOverviewResponse>(withQuery("/extra-curriculars", { year })),

  updateExtraCurricularSource: (
    sourceId: number,
    payload: ExtraCurricularSourceUpdatePayload,
  ): Promise<ExtraCurricularSourceSummary> =>
    fetchJson<ExtraCurricularSourceSummary>(`/extra-curriculars/${sourceId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  collectExtraCurricular: (payload: ExtraCurricularCollectPayload): Promise<Transaction> =>
    fetchJson<Transaction>("/extra-curriculars/collect", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getNotifications: (): Promise<NotificationItem[]> =>
    fetchJson<NotificationItem[]>("/notifications"),

  getUnreadCount: (): Promise<{ unread_count: number }> =>
    fetchJson<{ unread_count: number }>("/notifications/unread-count"),

  markNotificationRead: (id: number): Promise<void> =>
    fetchJson(`/notifications/${id}/read`, { method: "PATCH" }),

  markAllNotificationsRead: (): Promise<void> =>
    fetchJson("/notifications/read-all", { method: "PATCH" }),

  getAuditLogs: (filters: AuditLogFilters = {}): Promise<AuditLogItem[]> =>
    fetchJson<AuditLogItem[]>(
      withQuery("/audit-logs", {
        limit: filters.limit ?? 100,
        offset: filters.offset ?? 0,
        action: filters.action,
        actor: filters.actor,
        date_from: filters.date_from,
        date_to: filters.date_to,
      }),
    ),

  updateCarMaintenance: (
    occupantId: number,
    payload: { car_count: number; extra_car_maintenance_fee: string; status?: "occupied" | "vacant" | string },
  ): Promise<Occupant> =>
    fetchJson<Occupant>(`/tenants/${occupantId}/cars`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  updateTenantStatus: (
    occupantId: number,
    status: "occupied" | "vacant",
  ): Promise<Occupant> =>
    fetchJson<Occupant>(`/tenants/${occupantId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  updateTenant: (
    occupantId: number,
    payload: {
      name: string;
      contact?: string;
      cnic?: string;
      status?: "occupied" | "vacant" | string;
      is_rental?: boolean;
      tenant_name?: string;
      tenant_contact?: string;
      tenant_cnic?: string;
    },
  ): Promise<Occupant> =>
    fetchJson<Occupant>(`/tenants/${occupantId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  getBaseFees: (): Promise<{ occupied_fee: string; vacant_fee: string }> =>
    fetchJson<{ occupied_fee: string; vacant_fee: string }>("/settings/base-fee"),

  updateBaseFees: (payload: {
    occupied_fee: string;
    vacant_fee: string;
  }): Promise<{ occupied_fee: string; vacant_fee: string; updated_units: number }> =>
    fetchJson<{ occupied_fee: string; vacant_fee: string; updated_units: number }>("/settings/base-fee", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  // ─── New endpoints ────────────────────────────────────────────────────
  autoAllocatePayment: (payload: AutoAllocatePayload): Promise<AutoAllocateResult> =>
    fetchJson("/receipts/auto-allocate", { method: "POST", body: JSON.stringify(payload) }),

  getResidentLedger: (occupantId: number, year?: number): Promise<LedgerOut> =>
    fetchJson<LedgerOut>(withQuery(`/tenants/${occupantId}/ledger`, { year })),

  getPendingDuesReport: (): Promise<PendingDuesReport> =>
    fetchJson<PendingDuesReport>("/reports/pending-dues"),

  getDueReminders: (): Promise<DueRemindersOut> =>
    fetchJson<DueRemindersOut>("/reminders/due"),

  generateDueReminders: (): Promise<{ ok: boolean; message: string; reminders_sent: number }> =>
    fetchJson("/reminders/due/generate", { method: "POST" }),

  getReceiptUrl: (txnId: number): string => buildUrl(`/receipts/${txnId}/pdf`),

  getAdvancePaymentsReport: (): Promise<AdvancePaymentReport> =>
    fetchJson<AdvancePaymentReport>("/reports/advance-payments"),

  getExpenseReport: (year: number, month: number): Promise<ExpenseReport> =>
    fetchJson<ExpenseReport>(withQuery("/reports/expenses", { year, month })),

  getCashReconciliation: (year: number, month: number): Promise<CashReconciliationReport> =>
    fetchJson<CashReconciliationReport>(withQuery("/reports/cash-reconciliation", { year, month })),

  sendWhatsAppReminder: (payload: WhatsAppSendPayload): Promise<{ ok: boolean; message: string }> =>
    fetchJson("/whatsapp/send", { method: "POST", body: JSON.stringify(payload) }),

  sendWhatsAppBulk: (payload: WhatsAppBulkPayload): Promise<{ ok: boolean; sent: number; failed: number }> =>
    fetchJson("/whatsapp/send-bulk", { method: "POST", body: JSON.stringify(payload) }),

  getWhatsAppConfig: (): Promise<{ configured: boolean; provider: string | null }> =>
    fetchJson("/whatsapp/config"),

  warmUpBackend: (): void => {
    if (typeof window === "undefined") return;
    fetch(buildUrl("/health"), { method: "GET", cache: "no-store" }).catch(() => {});
  },

  exportMonthlyReport: async (year: number, month: number): Promise<void> => {
    const token = getToken();
    const res = await fetch(buildUrl(withQuery("/reports/monthly/export", { year, month })), {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      throw new Error(`Export failed (${res.status})`);
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Anum_Vista_Summary_Funds_Position_${year}_${String(month).padStart(2, "0")}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  getRolePermissions: (): Promise<RolePermissionsMap> =>
    fetchJson<RolePermissionsMap>("/roles/permissions"),

  updateRolePermissions: (
    role: "senior_admin" | "admin",
    permissions: Record<string, boolean>,
  ): Promise<{ role: string; permissions: Record<string, boolean> }> =>
    fetchJson(`/roles/permissions/${role}`, {
      method: "PUT",
      body: JSON.stringify({ permissions }),
    }),
};
