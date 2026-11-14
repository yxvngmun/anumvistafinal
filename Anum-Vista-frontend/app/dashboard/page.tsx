"use client";

import { useMemo, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Occupant } from "@/lib/types";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";

const formatPkr = (val: string | number) =>
  `₨ ${Number(val).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;

const computeTenantStatus = (tenant: Occupant): "Overdue" | "Settled" => {
  if (!tenant.last_paid_month) return "Overdue";
  const now = new Date();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastPaid = new Date(tenant.last_paid_month);
  if (Number.isNaN(lastPaid.getTime())) return "Overdue";
  return new Date(lastPaid.getFullYear(), lastPaid.getMonth(), 1) >= currentMonth ? "Settled" : "Overdue";
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function DashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!authLoading && user?.role !== "super_admin" && user?.role !== "senior_admin") {
      router.push("/tenants");
    }
  }, [authLoading, user, router]);

  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: () => api.getDashboardMetrics(),
  });

  const { data: tenants = [] } = useQuery({
    queryKey: ["tenants"],
    queryFn: api.getTenants,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions"],
    queryFn: () => api.getTransactions(),
  });

  const currentYear = new Date().getFullYear();

  const overdueResidents = useMemo(() => {
    return tenants
      .filter((t) => computeTenantStatus(t) === "Overdue")
      .map((t) => ({
        id: t.id,
        name: t.name,
        unit: t.unit.unit_no,
        remainingDue: t.expected_dues,
      }));
  }, [tenants]);

  const cashflowSeries = useMemo(() => {
    const byMonth = Array.from({ length: 12 }).map((_, i) => ({
      month: MONTH_NAMES[i],
      inflow: 0,
      outflow: 0,
    }));
    transactions.forEach((tx) => {
      const d = new Date(tx.date);
      if (Number.isNaN(d.getTime()) || d.getFullYear() !== currentYear) return;
      const amt = Number(tx.amount);
      if (!Number.isFinite(amt)) return;
      if (tx.type === "INFLOW") byMonth[d.getMonth()].inflow += amt;
      else byMonth[d.getMonth()].outflow += amt;
    });
    return byMonth;
  }, [transactions, currentYear]);

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    transactions.forEach((tx) => {
      const d = new Date(tx.date);
      if (Number.isNaN(d.getTime()) || d.getFullYear() !== currentYear) return;
      const amt = Number(tx.amount);
      if (!Number.isFinite(amt)) return;
      map.set(tx.category, (map.get(tx.category) ?? 0) + amt);
    });
    const colors: Record<string, string> = {
      maintenance: "#0284c7",
      expense: "#e11d48",
      ad_revenue: "#9333ea",
      other: "#64748b",
    };
    return Array.from(map.entries())
      .map(([name, value]) => ({ name: name.replace("_", " "), value, fill: colors[name] ?? "#64748b" }))
      .filter((e) => e.value > 0);
  }, [transactions, currentYear]);

  const cards = metrics
    ? [
        { title: "Total Revenue", subtitle: "This month", value: formatPkr(metrics.total_revenue) },
        { title: "Treasury Balance", subtitle: "Active holdings", value: formatPkr(metrics.treasury_balance) },
        { title: "Total Overdues", subtitle: "Unpaid dues", value: formatPkr(metrics.total_overdues), alert: Number(metrics.total_overdues) > 0 },
        { title: "Pending Approvals", subtitle: "Review required", value: metrics.pending_approvals.toString(), highlight: metrics.pending_approvals > 0, onClick: () => router.push("/transactions?focus=pending") },
        { title: "Advance Payments", subtitle: "Pre-collected", value: formatPkr(metrics.advance_payments) },
        { title: "Apartments", subtitle: "Total units", value: metrics.total_apartments.toString() },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Top Banner / Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Overview Dashboard
          </h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
            Real-time financial status, building performance, and collections
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => router.push("/transactions?tab=outflow")}
            className="rounded-lg border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors press-feedback"
          >
            Log Outflow
          </button>
          <button
            onClick={() => router.push("/tenants")}
            className="rounded-lg bg-black text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-200 px-4 py-2 text-sm font-bold transition-colors press-feedback shadow-sm"
          >
            Collect Inflow
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {metricsLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 rounded-xl bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 animate-pulse" />
            ))
          : cards.map((c, i) => (
              <div
                key={i}
                onClick={c.onClick}
                className={`rounded-xl p-4 border transition-colors ${
                  c.onClick ? "cursor-pointer press-feedback hover:border-black dark:hover:border-white" : ""
                } ${
                  c.highlight
                    ? "bg-amber-50 border-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30 text-amber-900 dark:text-amber-200"
                    : c.alert
                    ? "bg-rose-50 border-rose-300 dark:bg-rose-500/10 dark:border-rose-500/30 text-rose-900 dark:text-rose-200"
                    : "bg-white dark:bg-[#0d131f] border-slate-200 dark:border-white/10 text-slate-900 dark:text-white"
                }`}
              >
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 truncate">
                  {c.title}
                </p>
                <p className="mt-2 text-xl sm:text-2xl font-bold font-mono tabular-nums tracking-tight truncate">
                  {c.value}
                </p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 truncate">{c.subtitle}</p>
              </div>
            ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cashflow Line Chart */}
        <div className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Cashflow Dynamics ({currentYear})</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">Monthly comparison of inflows vs outflows</p>
            </div>
          </div>
          <div className="h-64 w-full min-w-0 min-h-[250px]">
            {mounted ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={cashflowSeries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" vertical={false} opacity={0.4} />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "#334155",
                      borderRadius: "8px",
                      fontSize: "12px",
                      color: "#f8fafc",
                    }}
                    formatter={(value) => [formatPkr(Number(value) || 0), ""]}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
                  <Line
                    type="monotone"
                    dataKey="inflow"
                    name="Inflow"
                    stroke="#0284c7"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#0284c7" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="outflow"
                    name="Outflow"
                    stroke="#e11d48"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#e11d48" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full rounded-lg bg-slate-100 dark:bg-white/[0.02] animate-pulse" />
            )}
          </div>
        </div>

        {/* Category Breakdown Pie Chart */}
        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-5 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Category Allocation</h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400">Proportional volume distribution</p>
          </div>
          <div className="h-56 w-full my-auto min-w-0 min-h-[220px]">
            {mounted ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={categoryBreakdown}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={3}
                  >
                    {categoryBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} stroke="#ffffff" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "#334155",
                      borderRadius: "8px",
                      fontSize: "12px",
                      color: "#f8fafc",
                    }}
                    formatter={(value) => [formatPkr(Number(value) || 0), ""]}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full rounded-lg bg-slate-100 dark:bg-white/[0.02] animate-pulse" />
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100 dark:border-white/10">
            {categoryBreakdown.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.fill }} />
                <span className="text-slate-600 dark:text-zinc-400 capitalize truncate">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Overdue Residents Table */}
      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Overdue Balances ({overdueResidents.length})
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400">Residents with outstanding arrears</p>
          </div>
          <button
            onClick={() => router.push("/reports/pending-dues")}
            className="text-xs font-semibold text-slate-600 hover:text-black dark:text-zinc-400 dark:hover:text-white transition-colors"
          >
            View Full Report →
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-zinc-400 font-bold uppercase text-[10px] bg-slate-50 dark:bg-white/[0.02]">
                <th className="py-2.5 px-3">Flat #</th>
                <th className="py-2.5 px-3">Resident</th>
                <th className="py-2.5 px-3 text-right">Expected Dues</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
              {overdueResidents.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-400 dark:text-zinc-500">
                    All residents are currently settled.
                  </td>
                </tr>
              ) : (
                overdueResidents.slice(0, 5).map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-3 font-bold text-slate-900 dark:text-white font-mono">{row.unit}</td>
                    <td className="py-3 px-3 text-slate-700 dark:text-zinc-200">{row.name}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                      {formatPkr(row.remainingDue)}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => router.push("/tenants")}
                        className="rounded-lg bg-slate-100 hover:bg-black hover:text-white text-slate-800 dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white dark:hover:text-black px-2.5 py-1 text-[11px] font-semibold transition-colors press-feedback"
                      >
                        Collect
                      </button>
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
