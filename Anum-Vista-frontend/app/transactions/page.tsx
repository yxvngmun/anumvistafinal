"use client";

import { useMemo, useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type {
  Transaction,
  TransactionType,
  TransactionCategory,
  Occupant,
} from "@/lib/types";

type StatusFilter = "ALL" | "pending" | "approved" | "restored" | "rejected" | "cancelled";
type YearFilter = "ALL" | number;

const TREASURERS = ["Naveed", "Asif", "Dilshad", "Ali", "Danish"];
const OPERATIONAL_TREASURERS = ["Naveed", "Dilshad", "Danish"];

const fmt = (v: string | number) =>
  `₨ ${Number(v).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const statusBadges: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
  pending: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
  restored: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20",
  rejected: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20",
  cancelled: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-zinc-500/10 dark:text-zinc-400 dark:border-zinc-500/20",
};

function TransactionsContent() {
  const { user } = useAuth();
  const router = useRouter();
  const isSuperAdmin = user?.role === "super_admin";
  const isSeniorAdmin = user?.role === "senior_admin";
  const isManagement = isSuperAdmin || isSeniorAdmin;
  const isDilshad = isSeniorAdmin || user?.username?.toLowerCase() === "dilshad";
  const isMaster = ["superadmin", "anumvista"].includes((user?.username || "").toLowerCase());
  const isAdmin = user?.role === "admin";

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [tenants, setTenants] = useState<Occupant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedYear, setSelectedYear] = useState<YearFilter>("ALL");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [restoreId, setRestoreId] = useState<number | null>(null);
  const [restoreReason, setRestoreReason] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);

  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const currentTab = requestedTab || "inflow";

  // Form states
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<TransactionType>("OUTFLOW");
  const [category, setCategory] = useState<TransactionCategory>("expense");
  const [occupantId, setOccupantId] = useState("");
  const [notes, setNotes] = useState("");
  const [generatedBy] = useState<"Naveed" | "Dilshad" | "System">("System");
  const [expDesc, setExpDesc] = useState("");
  const [expDetails, setExpDetails] = useState("");
  const [creditedTo, setCreditedTo] = useState("");
  const [transferFrom, setTransferFrom] = useState("");
  const [paymentMode, setPaymentMode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    try {
      const [t, o] = await Promise.all([api.getTransactions(), api.getTenants()]);
      setTransactions(t);
      setTenants(o);
    } catch {
      setError("Failed to load transactions");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const occupantMap = useMemo(() => {
    const map = new Map<number, string>();
    tenants.forEach((t) => map.set(t.id, `${t.unit.unit_no} — ${t.name}`));
    return map;
  }, [tenants]);

  const years = useMemo(() => {
    const set = new Set<number>();
    transactions.forEach((tx) => {
      const yr = new Date(tx.date).getFullYear();
      if (!Number.isNaN(yr)) set.add(yr);
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [transactions]);

  const pendingApprovals = useMemo(() => {
    if (!isManagement) return [];
    return transactions.filter((tx) => {
      if (tx.status !== "pending") return false;
      if (isMaster) return true;
      if (isDilshad) {
        return tx.type === "OUTFLOW" || tx.category === "ad_revenue" || tx.credited_to === "Dilshad";
      }
      if (isSuperAdmin) {
        return tx.type !== "OUTFLOW" && tx.credited_to !== "Dilshad";
      }
      return false;
    });
  }, [transactions, isManagement, isMaster, isDilshad, isSuperAdmin]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return transactions.filter((tx) => {
      const yrMatch = selectedYear === "ALL" || new Date(tx.date).getFullYear() === selectedYear;
      const label = tx.occupant_id ? occupantMap.get(tx.occupant_id) || "" : "General";
      const searchMatch = !q || label.toLowerCase().includes(q) || (tx.notes || "").toLowerCase().includes(q);
      const statusMatch = statusFilter === "ALL" || tx.status === statusFilter;
      const tabMatch = currentTab === "inflow" ? tx.type === "INFLOW" : tx.type !== "INFLOW";
      return yrMatch && searchMatch && statusMatch && tabMatch;
    });
  }, [transactions, searchQuery, selectedYear, statusFilter, occupantMap, currentTab]);

  const handleApprove = async (id: number) => {
    try {
      await api.approveTransaction(id);
      await loadData();
      setSuccessMsg("Transaction approved successfully");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleReject = async () => {
    if (!rejectId) return;
    try {
      await api.rejectTransaction(rejectId, rejectReason || "Rejected by Super Admin");
      await loadData();
      setRejectId(null);
      setRejectReason("");
      setSuccessMsg("Transaction rejected");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleCancel = async () => {
    if (!cancelId) return;
    try {
      await api.cancelTransaction(cancelId, cancelReason || "Cancelled by Super Admin");
      await loadData();
      setCancelId(null);
      setCancelReason("");
      setSuccessMsg("Transaction cancelled");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleRestore = async () => {
    if (!restoreId) return;
    const reason = restoreReason.trim();
    if (!reason) {
      setError("A compulsory reason note is required to restore a transaction.");
      return;
    }
    setIsRestoring(true);
    try {
      await api.restoreTransaction(restoreId, reason);
      await loadData();
      setRestoreId(null);
      setRestoreReason("");
      setSuccessMsg("Transaction restored, treasury adjusted, pending dues reopened, and logged.");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsRestoring(false);
    }
  };

  const resetForm = () => {
    setDate("");
    setAmount("");
    setType("OUTFLOW");
    setCategory("expense");
    setOccupantId("");
    setNotes("");
    setExpDesc("");
    setExpDetails("");
    setCreditedTo("");
    setTransferFrom("");
    setPaymentMode("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      if (type === "TRANSFER") {
        await api.createTransaction({
          date: `${date}T00:00:00`,
          amount,
          type: "TRANSFER",
          category: "other",
          generated_by: generatedBy,
          notes: notes || undefined,
          expense_details: expDetails || undefined,
          credited_to: creditedTo,
          transfer_from: transferFrom,
          payment_mode: paymentMode || undefined,
        });
      } else {
        await api.createTransaction({
          date: `${date}T00:00:00`,
          amount,
          type,
          category,
          occupant_id: occupantId ? Number(occupantId) : undefined,
          generated_by: generatedBy,
          notes: notes || undefined,
          expense_description: expDesc || undefined,
          expense_details: expDetails || undefined,
          credited_to: creditedTo || undefined,
          payment_mode: paymentMode || undefined,
        });
      }
      await loadData();
      setSuccessMsg(isManagement ? "Transaction logged" : "Submitted for approval");
      resetForm();
      setCreateOpen(false);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title & Tab Segmented Control */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {currentTab === "inflow" ? "Revenue & Collections" : "Expenses & Transfers"}
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            {filtered.length} entries matching current filter
          </p>
        </div>

        <div className="flex items-center gap-2">
          {currentTab === "outflow" && (isDilshad || isMaster) && (
            <button
              onClick={() => {
                resetForm();
                setType("OUTFLOW");
                setCreditedTo("Dilshad");
                setDate(new Date().toISOString().split("T")[0]);
                setCreateOpen(true);
              }}
              className="rounded-lg bg-black text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-200 px-3.5 py-1.5 text-xs font-bold transition-colors press-feedback shadow-sm"
            >
              + New Expense
            </button>
          )}
          {currentTab === "outflow" && isSuperAdmin && !isDilshad && !isMaster && (
            <button
              onClick={() => {
                resetForm();
                setType("TRANSFER");
                setCategory("other");
                setDate(new Date().toISOString().split("T")[0]);
                setCreateOpen(true);
              }}
              className="rounded-lg bg-black text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-200 px-3.5 py-1.5 text-xs font-bold transition-colors press-feedback shadow-sm"
            >
              + Internal Transfer
            </button>
          )}
        </div>
      </div>

      {successMsg && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20 px-3.5 py-2 text-xs text-emerald-800 dark:text-emerald-300">
          {successMsg}
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/20 px-3.5 py-2 text-xs text-rose-800 dark:text-rose-300 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-slate-400 hover:text-black dark:hover:text-white">✕</button>
        </div>
      )}

      {/* Pending Approvals Notice Banner */}
      {isManagement && pendingApprovals.length > 0 && (
        <div id="pending-approvals" className="rounded-xl border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300">
              Pending Approvals ({pendingApprovals.length})
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pendingApprovals.map((tx) => {
              const label = tx.occupant_id
                ? occupantMap.get(tx.occupant_id) || "Occupant"
                : tx.extra_source_name || tx.expense_description || (tx.type === "INFLOW" ? "Inflow" : `${tx.credited_to || "Dilshad"} Expense`);
              const isInflow = tx.type === "INFLOW";
              return (
                <div key={tx.id} className="rounded-lg bg-white dark:bg-[#0d131f] border border-slate-200 dark:border-white/10 p-3.5 space-y-2 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">{label}</p>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                        {fmtDate(tx.date)} · {tx.category} · {tx.notes || "No notes"}
                      </p>
                    </div>
                    <p className={`text-sm font-bold font-mono ${isInflow ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                      {isInflow ? "+" : "-"}{fmt(tx.amount)}
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-white/[0.06]">
                    <button
                      onClick={() => setRejectId(tx.id)}
                      className="rounded-md bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20 px-2.5 py-1 text-xs font-semibold transition-colors"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleApprove(tx.id)}
                      className="rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20 px-2.5 py-1 text-xs font-semibold transition-colors"
                    >
                      Approve
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] shadow-sm">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search notes or resident..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] px-3.5 py-1.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-black dark:focus:border-white transition-colors"
          />
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}
            className="rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0d131f] px-2.5 py-1.5 text-xs text-slate-900 dark:text-white outline-none"
          >
            <option value="ALL">All Years</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto">
          {(["ALL", "pending", "approved", "restored", "rejected", "cancelled"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors shrink-0 ${
                statusFilter === s
                  ? "bg-black text-white dark:bg-white dark:text-black shadow-sm"
                  : "text-slate-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
              }`}
            >
              {s === "ALL" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Transaction Records List */}
      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 animate-pulse" />
          ))
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-8 text-center text-xs text-slate-500 dark:text-zinc-400 shadow-sm">
            No transactions found matching criteria.
          </div>
        ) : (
          filtered.map((tx, idx) => {
            const isExp = expandedId === tx.id;
            const label = tx.occupant_id ? occupantMap.get(tx.occupant_id) || "Occupant" : "General";
            const txStatus = tx.status || "approved";
            return (
              <div
                key={`${tx.id}-${idx}`}
                className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] hover:border-slate-300 dark:hover:border-white/20 transition-colors shadow-sm overflow-hidden"
              >
                <div
                  onClick={() => setExpandedId(isExp ? null : tx.id)}
                  className="flex items-center justify-between p-3.5 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm font-mono font-bold text-slate-400">
                      {tx.type === "INFLOW" ? "↓" : tx.type === "OUTFLOW" ? "↑" : "⇄"}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{label}</p>
                        <span className={`rounded-full px-2 py-0.2 text-[9px] font-bold border ${statusBadges[txStatus]}`}>
                          {txStatus}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate mt-0.5">
                        {fmtDate(tx.date)} · {tx.category} · {tx.credited_to ? `Custodian: ${tx.credited_to}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p
                      className={`text-sm font-bold font-mono tabular-nums ${
                        tx.type === "INFLOW"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : tx.type === "OUTFLOW"
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-blue-600 dark:text-sky-400"
                      }`}
                    >
                      {tx.type === "INFLOW" ? "+" : tx.type === "OUTFLOW" ? "-" : ""}{fmt(tx.amount)}
                    </p>
                    <span className="text-[10px] text-slate-400">
                      {isExp ? "▲" : "▼"}
                    </span>
                  </div>
                </div>

                {isExp && (
                  <div className="border-t border-slate-100 dark:border-white/10 p-3.5 bg-slate-50/50 dark:bg-white/[0.01] text-xs space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-slate-700 dark:text-zinc-300">
                      <div>
                        <span className="block text-[10px] text-slate-500 dark:text-zinc-400 uppercase font-bold">Payment Mode</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{tx.payment_mode || "—"}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-500 dark:text-zinc-400 uppercase font-bold">Generated By</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{tx.generated_by || "System"}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-500 dark:text-zinc-400 uppercase font-bold">Receipt #</span>
                        <span className="font-mono text-slate-900 dark:text-white">{tx.receipt_no || "—"}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-500 dark:text-zinc-400 uppercase font-bold">Transfer Leg</span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {tx.transfer_from ? `${tx.transfer_from} → ${tx.credited_to}` : "—"}
                        </span>
                      </div>
                    </div>

                    {tx.notes && (
                      <p className="text-slate-700 dark:text-zinc-300 text-xs bg-white dark:bg-white/[0.02] p-2 rounded border border-slate-200 dark:border-white/10">
                        Notes: {tx.notes}
                      </p>
                    )}

                    {tx.restore_reason && (
                      <p className="text-purple-700 dark:text-purple-300 text-xs bg-purple-50 dark:bg-purple-500/10 p-2 rounded border border-purple-200 dark:border-purple-500/20">
                        Restored Reason: {tx.restore_reason}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-white/10">
                      {tx.type === "INFLOW" && (txStatus === "approved" || txStatus === "restored") && (
                        <button
                          onClick={() => {
                            const url = api.getReceiptUrl(tx.id);
                            const token = localStorage.getItem("av_token");
                            window.open(`${url}${url.includes("?") ? "&" : "?"}token=${token}`, "_blank");
                          }}
                          className="rounded-lg bg-slate-100 hover:bg-black hover:text-white text-slate-800 dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white dark:hover:text-black px-3 py-1.5 text-xs font-bold transition-colors press-feedback"
                        >
                          PDF Receipt ↗
                        </button>
                      )}
                      {isSuperAdmin && txStatus === "approved" && (
                        <>
                          <button
                            onClick={() => {
                              setRestoreId(tx.id);
                              setRestoreReason("");
                            }}
                            className="rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20 px-3 py-1.5 text-xs font-semibold transition-colors"
                          >
                            Restore
                          </button>
                          <button
                            onClick={() => setCancelId(tx.id)}
                            className="rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20 px-3 py-1.5 text-xs font-semibold transition-colors"
                          >
                            Cancel Transaction
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* New Expense Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Record Outflow / Expense</h3>
              <button onClick={() => setCreateOpen(false)} className="text-slate-400 hover:text-black dark:hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-zinc-400 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] px-3 py-1.5 text-xs text-slate-900 dark:text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-zinc-400 mb-1">Amount (PKR)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 5000"
                    className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] px-3 py-1.5 text-xs text-slate-900 dark:text-white outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-zinc-400 mb-1">Type</label>
                  <select
                    value={type}
                    onChange={(e) => {
                      const next = e.target.value as TransactionType;
                      setType(next);
                      if (next === "OUTFLOW") setCreditedTo("Dilshad");
                      else setCreditedTo("");
                    }}
                    className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0d131f] px-3 py-1.5 text-xs text-slate-900 dark:text-white outline-none"
                  >
                    {(isDilshad || isMaster) && <option value="OUTFLOW">Expense (Outflow)</option>}
                    <option value="TRANSFER">Internal Transfer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-zinc-400 mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as TransactionCategory)}
                    className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0d131f] px-3 py-1.5 text-xs text-slate-900 dark:text-white outline-none"
                  >
                    <option value="expense">Building Expense</option>
                    <option value="ad_revenue">Ad / Marketing</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              {type === "TRANSFER" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-zinc-400 mb-1">From Treasurer</label>
                    <select
                      required
                      value={transferFrom}
                      onChange={(e) => setTransferFrom(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0d131f] px-3 py-1.5 text-xs text-slate-900 dark:text-white outline-none"
                    >
                      <option value="">Select...</option>
                      {TREASURERS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-zinc-400 mb-1">To Treasurer (No Danish)</label>
                    <select
                      required
                      value={creditedTo}
                      onChange={(e) => setCreditedTo(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0d131f] px-3 py-1.5 text-xs text-slate-900 dark:text-white outline-none"
                    >
                      <option value="">Select...</option>
                      {TREASURERS.filter((t) => t !== "Danish").map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-zinc-400 mb-1">Disbursed By</label>
                    <input
                      type="text"
                      readOnly
                      value="Dilshad (Expense Recorder)"
                      className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-slate-100 dark:bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-200 outline-none cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-zinc-400 mb-1">Payment Mode</label>
                    <select
                      value={paymentMode}
                      onChange={(e) => setPaymentMode(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0d131f] px-3 py-1.5 text-xs text-slate-900 dark:text-white outline-none"
                    >
                      <option value="cash">Cash</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="cheque">Cheque</option>
                      <option value="online">Online</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-zinc-400 mb-1">Notes / Description</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Generator fuel or repairs"
                  className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] px-3.5 py-1.5 text-xs text-slate-900 dark:text-white outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-lg border border-slate-300 dark:border-white/10 px-4 py-2 text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:text-black dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-black text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-200 px-5 py-2 text-xs font-bold transition-colors press-feedback disabled:opacity-50"
                >
                  {isSubmitting ? "Submitting..." : isSuperAdmin ? "Log Transaction" : "Submit for Approval"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-5 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Reject Transaction</h3>
            <input
              type="text"
              placeholder="Reason for rejection (optional)..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] p-2 text-xs text-slate-900 dark:text-white outline-none"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setRejectId(null)} className="rounded-lg border border-slate-300 dark:border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-zinc-400">Cancel</button>
              <button onClick={handleReject} className="rounded-lg bg-rose-600 text-white px-3 py-1.5 text-xs font-bold">Confirm Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Modal (Super Admin Only, Compulsory Reason) */}
      {restoreId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-5 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Restore Approved Transaction</h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Restoring reverses this amount from the treasurer&apos;s balance, reopens pending dues/targets, and logs a permanent audit entry. A reason note is compulsory.
            </p>
            <textarea
              rows={3}
              placeholder="Compulsory reason for restoring..."
              value={restoreReason}
              onChange={(e) => setRestoreReason(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] p-2.5 text-xs text-slate-900 dark:text-white outline-none"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setRestoreId(null)} className="rounded-lg border border-slate-300 dark:border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-zinc-400">Back</button>
              <button
                onClick={handleRestore}
                disabled={isRestoring || !restoreReason.trim()}
                className="rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-4 py-1.5 text-xs font-bold"
              >
                {isRestoring ? "Restoring..." : "Confirm Restore"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancelId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-5 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Cancel Approved Transaction</h3>
            <input
              type="text"
              placeholder="Reason for cancellation..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] p-2 text-xs text-slate-900 dark:text-white outline-none"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setCancelId(null)} className="rounded-lg border border-slate-300 dark:border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-zinc-400">Back</button>
              <button onClick={handleCancel} className="rounded-lg bg-black text-white px-3 py-1.5 text-xs font-bold">Confirm Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-slate-200 dark:bg-white/5" />}>
      <TransactionsContent />
    </Suspense>
  );
}
