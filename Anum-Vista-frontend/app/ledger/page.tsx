"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, LedgerOut } from "@/lib/api";
import type { Occupant } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";

const fmt = (v: string | number) =>
  `₨ ${Number(v).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;

const statusStyles: Record<string, string> = {
  paid: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20",
  pending: "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/20",
  partial: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20",
  advance: "bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-500/20",
  upcoming: "bg-slate-100 dark:zinc-500/10 text-slate-700 dark:text-zinc-400 border-slate-200 dark:border-zinc-500/20",
};

export default function LedgerPage() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const isSuperAdmin = user?.role === "super_admin" || user?.role === "senior_admin";

  useEffect(() => {
    if (isAuthenticated && user && !isSuperAdmin) {
      router.replace("/tenants");
    }
  }, [isAuthenticated, user, isSuperAdmin, router]);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [search, setSearch] = useState("");

  const { data: tenants = [] } = useQuery<Occupant[]>({
    queryKey: ["tenants"],
    queryFn: api.getTenants,
    enabled: isAuthenticated && isSuperAdmin,
  });

  const { data: ledger, isLoading: ledgerLoading } = useQuery<LedgerOut>({
    queryKey: ["ledger", selectedId, year],
    queryFn: () => api.getResidentLedger(selectedId!, year),
    enabled: isAuthenticated && isSuperAdmin && selectedId != null,
  });

  const filteredTenants = tenants.filter((t) => {
    if (!t.unit?.unit_no) return false;
    const q = search.trim().toLowerCase();
    return !q || t.name.toLowerCase().includes(q) || t.unit.unit_no.toLowerCase().includes(q);
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
      <div>
        <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">Resident Ledger</h2>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Month-by-month payment statement and historical clearance</p>
      </div>

      {/* Selector Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] shadow-sm">
        <div className="relative flex-1 max-w-sm">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (selectedId) setSelectedId(null);
            }}
            placeholder="Search flat # or resident..."
            className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] px-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 outline-none focus:border-slate-400 dark:focus:border-white/30"
          />
          {search && !selectedId && filteredTenants.length > 0 && (
            <div className="absolute left-0 top-full mt-1 z-30 w-full max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] shadow-xl p-1 divide-y divide-slate-100 dark:divide-white/[0.04]">
              {filteredTenants.slice(0, 8).map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedId(t.id);
                    setSearch(`${t.unit.unit_no} — ${t.name}`);
                  }}
                  className="w-full p-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-white/[0.06] rounded-lg transition-colors flex items-center justify-between"
                >
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">{t.unit.unit_no}</span>
                  <span className="text-slate-600 dark:text-zinc-300 truncate">{t.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] px-3 py-2 text-xs text-slate-900 dark:text-white shadow-sm outline-none"
        >
          {[2024, 2025, 2026, 2027].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Ledger Grid View */}
      {selectedId == null ? (
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-12 text-center text-xs text-slate-500 dark:text-zinc-400 shadow-sm">
          Search and pick a resident above to inspect their annual statement.
        </div>
      ) : ledgerLoading ? (
        <div className="h-64 rounded-2xl bg-slate-100 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.05] animate-pulse" />
      ) : ledger ? (
        <div className="space-y-6">
          {/* Summary pill */}
          {(() => {
            const pendingEntries = ledger.entries.filter((e) => e.status === "pending" || e.status === "partial");
            const overdueMonths = pendingEntries.length;
            const outstandingDues = pendingEntries.reduce(
              (acc, e) => acc + Math.max(0, Number(e.amount_due) - Number(e.amount_paid)),
              0
            );
            const advanceBalance = ledger.entries
              .filter((e) => e.status === "advance")
              .reduce((acc, e) => acc + Number(e.amount_paid), 0);

            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] shadow-sm">
                  <span className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Base Maintenance</span>
                  <p className="text-base font-bold font-mono text-slate-900 dark:text-white mt-1">{fmt(ledger.monthly_fee)}</p>
                </div>
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] shadow-sm">
                  <span className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Total Months Overdue</span>
                  <p className="text-base font-bold font-mono text-rose-600 dark:text-rose-400 mt-1">{overdueMonths} months</p>
                </div>
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] shadow-sm">
                  <span className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Outstanding Dues</span>
                  <p className="text-base font-bold font-mono text-rose-600 dark:text-rose-400 mt-1">{fmt(outstandingDues)}</p>
                </div>
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] shadow-sm">
                  <span className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Advance Paid</span>
                  <p className="text-base font-bold font-mono text-sky-600 dark:text-sky-400 mt-1">{fmt(advanceBalance)}</p>
                </div>
              </div>
            );
          })()}

          {/* 12-Month Calendar Grid */}
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Statement Period: {year}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {ledger.entries.map((m) => (
                <div
                  key={m.month_key}
                  className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.01] p-3 text-center space-y-2"
                >
                  <p className="text-xs font-semibold text-slate-700 dark:text-zinc-200">{m.label.split(" ")[0]}</p>
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-medium border uppercase tracking-wider ${
                      statusStyles[m.status] || "bg-slate-100 dark:bg-zinc-500/10 text-slate-700 dark:text-zinc-400 border-slate-200 dark:border-zinc-500/20"
                    }`}
                  >
                    {m.status}
                  </span>
                  <p className="text-xs font-mono font-medium text-slate-900 dark:text-white tabular-nums">
                    {Number(m.amount_paid) > 0 ? fmt(m.amount_paid) : fmt(m.amount_due)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
