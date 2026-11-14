"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, ExpenseReport, hasPermission } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

const fmt = (v: string | number) =>
  `₨ ${Number(v).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function ExpensesPage() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const isSuperAdmin = hasPermission(user, "reports_ledger");

  useEffect(() => {
    if (isAuthenticated && user && !isSuperAdmin) {
      router.replace("/tenants");
    }
  }, [isAuthenticated, user, isSuperAdmin, router]);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data, isLoading } = useQuery<ExpenseReport>({
    queryKey: ["reports", "expenses", year, month],
    queryFn: () => api.getExpenseReport(year, month),
    enabled: isAuthenticated && isSuperAdmin,
  });

  if (!isAuthenticated) return null;
  if (user && !isSuperAdmin) {
    return (
      <div className="p-8 text-center text-sm text-slate-500 dark:text-zinc-400">
        Super Admin permissions required to view Reports & Ledgers.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">Expense Breakdown</h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Itemized operational costs for {MONTH_LABELS[month - 1]} {year}</p>
        </div>
        <div className="text-left sm:text-right">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-zinc-400">Total Monthly Outflow</span>
          <p className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400 tabular-nums">
            {fmt(data?.total_expenses ?? 0)}
          </p>
        </div>
      </div>

      {/* Date Pickers */}
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

      {/* Itemized Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-zinc-400 uppercase text-[10px] bg-slate-50 dark:bg-white/[0.01]">
              <th className="py-3 px-4">Category</th>
              <th className="py-3 px-4">Description</th>
              <th className="py-3 px-4 text-center">Txns Count</th>
              <th className="py-3 px-4 text-right">Total Outflow</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={4} className="py-4 px-4"><div className="h-5 bg-slate-100 dark:bg-white/[0.03] rounded" /></td>
                </tr>
              ))
            ) : (data?.entries ?? []).length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-slate-400 dark:text-zinc-400">No expenses recorded for this month</td>
              </tr>
            ) : (
              (data?.entries ?? []).map((e, idx) => (
                <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="py-3.5 px-4 capitalize font-semibold text-slate-900 dark:text-white">{e.category}</td>
                  <td className="py-3.5 px-4 text-slate-600 dark:text-zinc-300">{e.description || "—"}</td>
                  <td className="py-3.5 px-4 text-center font-mono text-slate-500 dark:text-zinc-400">{e.count}</td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-rose-600 dark:text-rose-300 tabular-nums">
                    -{fmt(e.total)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
