"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, AdvancePaymentReport } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function AdvancePaymentsPage() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const isSuperAdmin = user?.role === "super_admin" || user?.role === "senior_admin";

  useEffect(() => {
    if (isAuthenticated && user && !isSuperAdmin) {
      router.replace("/tenants");
    }
  }, [isAuthenticated, user, isSuperAdmin, router]);

  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<AdvancePaymentReport>({
    queryKey: ["reports", "advance-payments"],
    queryFn: api.getAdvancePaymentsReport,
    enabled: isAuthenticated && isSuperAdmin,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.entries.filter(
      (e) => !q || e.name.toLowerCase().includes(q) || e.unit_no.toLowerCase().includes(q)
    );
  }, [data, search]);

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
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">Advance Payments Report</h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Residents who have pre-paid ahead of the current cycle</p>
        </div>
        <div className="text-left sm:text-right">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-zinc-400">Total Pre-paid Units</span>
          <p className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
            {data?.entries.length ?? 0}
          </p>
        </div>
      </div>

      {/* Control bar */}
      <div className="p-2 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] shadow-sm max-w-sm">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter flat # or resident..."
          className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] px-3.5 py-1.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 outline-none"
        />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-zinc-400 uppercase text-[10px] bg-slate-50 dark:bg-white/[0.01]">
              <th className="py-3 px-4">Flat #</th>
              <th className="py-3 px-4">Resident</th>
              <th className="py-3 px-4 text-center">Months Ahead</th>
              <th className="py-3 px-4">Paid Through</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={4} className="py-4 px-4"><div className="h-5 bg-slate-100 dark:bg-white/[0.03] rounded" /></td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-slate-400 dark:text-zinc-400">No advance payment records</td>
              </tr>
            ) : (
              filtered.map((e, idx) => (
                <tr key={`${e.unit_no}-${idx}`} className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="py-3.5 px-4 font-mono font-semibold text-slate-900 dark:text-white">{e.unit_no}</td>
                  <td className="py-3.5 px-4 font-medium text-slate-900 dark:text-zinc-100">{e.name}</td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-mono">
                      +{e.months_ahead} mo
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-zinc-300">
                    {e.paid_through}
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
