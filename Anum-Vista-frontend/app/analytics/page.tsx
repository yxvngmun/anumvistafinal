"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import type { MonthlyTransactionLine } from "@/lib/types";

const months = [
  { label: "January", short: "Jan", value: 1 },
  { label: "February", short: "Feb", value: 2 },
  { label: "March", short: "Mar", value: 3 },
  { label: "April", short: "Apr", value: 4 },
  { label: "May", short: "May", value: 5 },
  { label: "June", short: "Jun", value: 6 },
  { label: "July", short: "Jul", value: 7 },
  { label: "August", short: "Aug", value: 8 },
  { label: "September", short: "Sep", value: 9 },
  { label: "October", short: "Oct", value: 10 },
  { label: "November", short: "Nov", value: 11 },
  { label: "December", short: "Dec", value: 12 },
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  maintenance: "#0284c7",
  ad_revenue: "#9333ea",
  expense: "#e11d48",
  other: "#64748b",
};

const num = (v?: string | null) => (v ? Number(v) || 0 : 0);

const fmtPkr = (v: number | string) =>
  `₨ ${Number(v).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export default function MonthlyAnalyticsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [mounted, setMounted] = useState(false);
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!authLoading && user?.role !== "super_admin" && user?.role !== "senior_admin") {
      router.push("/tenants");
    }
  }, [authLoading, user, router]);

  const {
    data: report,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["monthly-report", year, month],
    queryFn: () => api.getMonthlyReport(year, month),
    enabled: user?.role === "super_admin" || user?.role === "senior_admin",
  });

  const monthLabel = useMemo(
    () => months.find((m) => m.value === month)?.label ?? String(month),
    [month],
  );
  const periodLabel = `${monthLabel} ${year}`;

  const outflowCats = useMemo(() => {
    if (!report) return [];
    return Object.entries(report.outflow_by_category)
      .map(([name, value]) => ({ name: name.replace("_", " "), value: num(value), fill: CATEGORY_COLORS[name] ?? "#e11d48" }))
      .sort((a, b) => b.value - a.value);
  }, [report]);

  const treasurerChart = useMemo(() => {
    if (!report) return [];
    const inflow = report.inflow_by_treasurer ?? {};
    const outflow = report.outflow_by_treasurer ?? {};
    const holders = new Set<string>([...Object.keys(inflow), ...Object.keys(outflow)]);
    return Array.from(holders).map((h) => ({
      holder: h,
      inflow: num(inflow[h]),
      outflow: num(outflow[h]),
    }));
  }, [report]);

  const transactions: MonthlyTransactionLine[] = report?.transactions ?? [];

  const cards = report
    ? [
        { label: "Total Inflow", value: report.inflow_total, color: "text-emerald-600 dark:text-emerald-400" },
        { label: "Total Outflow", value: report.outflow_total, color: "text-rose-600 dark:text-rose-400" },
        { label: "Net Period Flow", value: report.net_flow ?? String(num(report.inflow_total) - num(report.outflow_total)), color: "text-sky-600 dark:text-sky-400" },
        { label: "Maintenance Recv", value: report.maintenance_received, color: "text-slate-900 dark:text-white" },
        { label: "Transfers Leg", value: report.transfer_total, color: "text-purple-600 dark:text-purple-300" },
        { label: "Closing Treasury", value: report.treasury_closing ?? "0", color: "text-emerald-600 dark:text-emerald-400" },
      ]
    : [];

  if (authLoading || (user?.role !== "super_admin" && user?.role !== "senior_admin")) return null;

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">Financial Analytics</h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Comprehensive audit breakdown for {periodLabel}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] px-3 py-1.5 text-xs text-slate-900 dark:text-white shadow-sm outline-none"
          >
            {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] px-3 py-1.5 text-xs text-slate-900 dark:text-white shadow-sm outline-none"
          >
            {months.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <button
            onClick={() => refetch()}
            className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-slate-700 dark:text-white hover:bg-slate-50 dark:hover:bg-white/[0.08] shadow-sm transition-colors press-feedback"
          >
            {isFetching ? "Syncing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-slate-100 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.05] animate-pulse" />
            ))
          : cards.map((c, i) => (
              <div
                key={i}
                className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-4 shadow-sm"
              >
                <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-zinc-400">{c.label}</p>
                <p className={`mt-2 text-base sm:text-lg font-bold font-mono tabular-nums ${c.color}`}>
                  {fmtPkr(c.value)}
                </p>
              </div>
            ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Custodian Activity */}
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Custodian Inflow vs Outflow</h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mb-4">Volume handled per treasurer during {periodLabel}</p>
          <div className="h-60 w-full min-w-0 min-h-0">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
                <BarChart data={treasurerChart} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-zinc-800" vertical={false} />
                  <XAxis dataKey="holder" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#000000",
                      borderColor: "rgba(255,255,255,0.15)",
                      borderRadius: "12px",
                      fontSize: "12px",
                      color: "#ffffff",
                    }}
                    formatter={(val) => [fmtPkr(Number(val) || 0), ""]}
                  />
                  <Bar dataKey="inflow" name="Inflow" fill="#0284c7" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="outflow" name="Outflow" fill="#e11d48" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full rounded-lg bg-slate-50 dark:bg-white/[0.02] animate-pulse" />
            )}
          </div>
        </div>

        {/* Expenses by Category */}
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Outflow Breakdown</h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mb-4">Expense categories in {periodLabel}</p>
          <div className="space-y-3">
            {outflowCats.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-zinc-400 py-12 text-center">No outflows recorded in this period</p>
            ) : (
              outflowCats.map((cat, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-zinc-300 capitalize">{cat.name}</span>
                    <span className="font-mono font-medium text-slate-900 dark:text-white">{fmtPkr(cat.value)}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-white/[0.05] overflow-hidden">
                    <div
                      className="h-full bg-rose-500 rounded-full"
                      style={{
                        width: `${Math.min(100, (cat.value / (num(report?.outflow_total) || 1)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Transaction lines table */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-white uppercase tracking-wider">
            Period Transactions ({transactions.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-zinc-400 uppercase text-[10px] bg-slate-50 dark:bg-white/[0.01]">
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Party / Occupant</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Custodian</th>
                <th className="py-2.5 px-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400 dark:text-zinc-400">No transactions this month</td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-3 text-slate-500 dark:text-zinc-400">{fmtDate(tx.date)}</td>
                    <td className="py-3 px-3">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold ${
                          tx.type === "INFLOW" ? "text-emerald-600 dark:text-emerald-400" : tx.type === "OUTFLOW" ? "text-rose-600 dark:text-rose-400" : "text-sky-600 dark:text-sky-400"
                        }`}
                      >
                        {tx.type}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-900 dark:text-white font-medium">{tx.occupant_name || "General"}</td>
                    <td className="py-3 px-3 text-slate-500 dark:text-zinc-400 capitalize">{tx.category}</td>
                    <td className="py-3 px-3 text-slate-700 dark:text-zinc-300">{tx.credited_to || "—"}</td>
                    <td
                      className={`py-3 px-3 text-right font-mono font-bold tabular-nums ${
                        tx.type === "INFLOW" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {tx.type === "INFLOW" ? "+" : "-"}{fmtPkr(tx.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
