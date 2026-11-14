"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, CashReconciliationReport, hasPermission } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

const fmt = (v: string | number | null | undefined) =>
  v != null ? `₨ ${Number(v).toLocaleString("en-PK", { maximumFractionDigits: 0 })}` : "—";

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function CashReconciliationPage() {
  const { user, isAuthenticated } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const isSuperAdmin = hasPermission(user, "reports_ledger");

  const { data } = useQuery<CashReconciliationReport>({
    queryKey: ["reports", "cash-reconciliation", year, month],
    queryFn: () => api.getCashReconciliation(year, month),
    enabled: isAuthenticated && isSuperAdmin,
  });

  if (!isAuthenticated) return null;
  if (!isSuperAdmin) {
    return (
      <div className="p-8 text-center text-xs text-slate-500 dark:text-zinc-400">
        Super Admin permissions required to view cash reconciliation reports.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">Cash Reconciliation</h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            Audit of physical custody and net movements for {MONTH_LABELS[month - 1]} {year}
          </p>
        </div>
      </div>

      {/* Date Selectors */}
      <div className="flex items-center gap-2 p-2 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] shadow-sm max-w-sm">
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="flex-1 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] px-3 py-1.5 text-xs text-slate-900 dark:text-white outline-none"
        >
          {MONTH_LABELS.map((label, i) => (
            <option key={i + 1} value={i + 1}>{label}</option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="flex-1 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] px-3 py-1.5 text-xs text-slate-900 dark:text-white outline-none"
        >
          {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Flow Cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] shadow-sm">
            <span className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Total Inflow</span>
            <p className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums mt-1">{fmt(data.total_inflow)}</p>
          </div>
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] shadow-sm">
            <span className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Total Outflow</span>
            <p className="text-lg font-bold font-mono text-rose-600 dark:text-rose-400 tabular-nums mt-1">{fmt(data.total_outflow)}</p>
          </div>
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] shadow-sm">
            <span className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Net Monthly Flow</span>
            <p className="text-lg font-bold font-mono text-sky-600 dark:text-sky-400 tabular-nums mt-1">{fmt(data.net_flow)}</p>
          </div>
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] shadow-sm">
            <span className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Closing Cash Position</span>
            <p className="text-lg font-bold font-mono text-slate-900 dark:text-white tabular-nums mt-1">{fmt(data.closing_balance)}</p>
          </div>
        </div>
      )}

      {/* Per-Treasurer Splits */}
      {data && data.by_treasurer && Object.keys(data.by_treasurer).length > 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Balances by Custodian</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {Object.entries(data.by_treasurer).map(([person, amount]) => (
              <div key={person} className="p-3 rounded-xl border border-slate-200 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.01]">
                <p className="text-xs font-semibold text-slate-800 dark:text-zinc-200">{person}</p>
                <p className="text-sm font-bold font-mono text-slate-900 dark:text-white tabular-nums mt-1">{fmt(amount)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
