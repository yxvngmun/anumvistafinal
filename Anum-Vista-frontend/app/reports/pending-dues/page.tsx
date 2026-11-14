"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, PendingDuesReport, hasPermission } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

const fmt = (v: string | number) =>
  `₨ ${Number(v).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;

type SortKey = "unit_no" | "name" | "months_overdue" | "total_due";

export default function PendingDuesPage() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const isSuperAdmin = hasPermission(user, "reports_ledger");

  useEffect(() => {
    if (isAuthenticated && user && !isSuperAdmin) {
      router.replace("/tenants");
    }
  }, [isAuthenticated, user, isSuperAdmin, router]);

  const [sortBy, setSortBy] = useState<SortKey>("total_due");
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<PendingDuesReport>({
    queryKey: ["reports", "pending-dues"],
    queryFn: api.getPendingDuesReport,
    enabled: isAuthenticated && isSuperAdmin,
  });

  if (user && !isSuperAdmin) {
    return (
      <div className="p-8 text-center text-sm text-slate-500 dark:text-zinc-400">
        Super Admin permissions required to view Reports & Ledgers.
      </div>
    );
  }

  const sorted = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.entries
      .filter((e) => {
        if (!e.unit_no || e.unit_no.toLowerCase().includes("appartment no")) return false;
        if (!e.name || e.name.toLowerCase().includes("residents name")) return false;
        return !q || e.name.toLowerCase().includes(q) || e.unit_no.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortBy === "unit_no") cmp = a.unit_no.localeCompare(b.unit_no, undefined, { numeric: true });
        else if (sortBy === "name") cmp = a.name.localeCompare(b.name);
        else if (sortBy === "months_overdue") cmp = a.months_overdue - b.months_overdue;
        else cmp = Number(a.total_due) - Number(b.total_due);
        return sortAsc ? cmp : -cmp;
      });
  }, [data, sortBy, sortAsc, search]);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortAsc(!sortAsc);
    else {
      setSortBy(key);
      setSortAsc(false);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">Pending Dues Report</h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Summary of all residents with unsettled maintenance dues</p>
        </div>
        <div className="text-left sm:text-right">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-zinc-400">Total Outstanding</span>
          <p className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400 tabular-nums">
            {fmt(data?.total_due ?? 0)}
          </p>
        </div>
      </div>

      {/* Control bar */}
      <div className="flex items-center justify-between gap-3 p-2 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] shadow-sm">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search flat # or resident..."
          className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] px-3.5 py-1.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 outline-none w-full sm:w-72"
        />
        <span className="text-xs text-slate-500 dark:text-zinc-400 font-mono pr-2">
          {sorted.length} overdue units
        </span>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-zinc-400 uppercase text-[10px] bg-slate-50 dark:bg-white/[0.01]">
              <th onClick={() => toggleSort("unit_no")} className="py-3 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-white">
                Flat # {sortBy === "unit_no" ? (sortAsc ? "↑" : "↓") : ""}
              </th>
              <th onClick={() => toggleSort("name")} className="py-3 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-white">
                Resident {sortBy === "name" ? (sortAsc ? "↑" : "↓") : ""}
              </th>
              <th className="py-3 px-4">Last Paid Month</th>
              <th onClick={() => toggleSort("months_overdue")} className="py-3 px-4 text-center cursor-pointer hover:text-slate-900 dark:hover:text-white">
                Overdue Months {sortBy === "months_overdue" ? (sortAsc ? "↑" : "↓") : ""}
              </th>
              <th className="py-3 px-4 text-right">Monthly Fee</th>
              <th onClick={() => toggleSort("total_due")} className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 dark:hover:text-white">
                Total Due {sortBy === "total_due" ? (sortAsc ? "↑" : "↓") : ""}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={6} className="py-4 px-4"><div className="h-5 bg-slate-100 dark:bg-white/[0.03] rounded" /></td>
                </tr>
              ))
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-400 dark:text-zinc-400">No overdue balances</td>
              </tr>
            ) : (
              sorted.map((e, idx) => (
                <tr key={`${e.occupant_id ?? ""}-${e.unit_no}-${idx}`} className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="py-3.5 px-4 font-mono font-semibold text-slate-900 dark:text-white">{e.unit_no}</td>
                  <td className="py-3.5 px-4 font-medium text-slate-900 dark:text-zinc-100">{e.name}</td>
                  <td className="py-3.5 px-4 font-mono text-slate-500 dark:text-zinc-400">{e.last_paid_month || "None"}</td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 px-2 py-0.5 text-[10px] font-mono">
                      {e.months_overdue} mo
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-slate-600 dark:text-zinc-300">{fmt(e.monthly_fee)}</td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-rose-600 dark:text-rose-300 tabular-nums">
                    {fmt(e.total_due)}
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
