"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, UnpaidMonth } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Occupant } from "@/lib/types";

const fmt = (v: string | number) =>
  `₨ ${Number(v).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;

const formatMonthDisplay = (keyOrLabel: string): string => {
  if (!keyOrLabel) return "";
  if (/^\d{4}-\d{2}$/.test(keyOrLabel)) {
    const [year, month] = keyOrLabel.split("-").map(Number);
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    if (month >= 1 && month <= 12) {
      return `${monthNames[month - 1]} ${year}`;
    }
  }
  return keyOrLabel;
};

const computeStatus = (t: Occupant): "Overdue" | "Settled" => {
  if (!t.last_paid_month) return "Overdue";
  const now = new Date();
  const cur = new Date(now.getFullYear(), now.getMonth(), 1);
  const lp = new Date(t.last_paid_month);
  if (Number.isNaN(lp.getTime())) return "Overdue";
  return new Date(lp.getFullYear(), lp.getMonth(), 1) >= cur ? "Settled" : "Overdue";
};

const DEFAULT_TREASURERS = ["Naveed", "Asif", "Dilshad", "Ali", "Danish"];

export default function TenantsPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OVERDUE" | "SETTLED">("ALL");
  const [selectedTenant, setSelectedTenant] = useState<Occupant | null>(null);
  const [editingTenant, setEditingTenant] = useState<Occupant | null>(null);
  const [editName, setEditName] = useState("");
  const [editContact, setEditContact] = useState("");
  const [editCnic, setEditCnic] = useState("");
  const [editStatus, setEditStatus] = useState<"occupied" | "vacant">("occupied");
  const [isUpdating, setIsUpdating] = useState(false);
  const [treasurers, setTreasurers] = useState<string[]>(DEFAULT_TREASURERS);
  const [creditedTo, setCreditedTo] = useState(DEFAULT_TREASURERS[0]);
  const [generatedBy] = useState<"Naveed" | "Dilshad" | "System">("System");
  const [paymentMode, setPaymentMode] = useState<string>("cash");
  const [autoAllocateMode, setAutoAllocateMode] = useState(false);
  const [autoAmount, setAutoAmount] = useState("");
  const [autoResult, setAutoResult] = useState<{ months_count: number; remainder: string; total_applied: string } | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());
  const [unpaidMonths, setUnpaidMonths] = useState<UnpaidMonth[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["tenants"],
    queryFn: api.getTenants,
  });

  useEffect(() => {
    api.getTreasurers().then((resp) => {
      if (resp.treasurers?.length) {
        setTreasurers(resp.treasurers);
        setCreditedTo(resp.treasurers[0]);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedTenant) {
      setUnpaidMonths([]);
      setSelectedMonths(new Set());
      setAutoResult(null);
      return;
    }
    api.getUnpaidMonths(selectedTenant.id).then((r) => {
      setUnpaidMonths(r.months);
      if (r.months.length > 0) setSelectedMonths(new Set([r.months[0].month_key]));
    }).catch(() => {});
  }, [selectedTenant]);

  const filteredTenants = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenants.filter((t) => {
      if (t.name?.toLowerCase().includes("residents name") || t.unit?.unit_no?.toLowerCase().includes("appartment no")) {
        return false;
      }
      const matchSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.unit.unit_no.toLowerCase().includes(q) ||
        (t.contact || "").includes(q);
      const st = computeStatus(t);
      const matchStatus =
        statusFilter === "ALL" ||
        (statusFilter === "OVERDUE" && st === "Overdue") ||
        (statusFilter === "SETTLED" && st === "Settled");
      return matchSearch && matchStatus;
    });
  }, [tenants, search, statusFilter]);

  const openEditModal = (t: Occupant) => {
    setEditingTenant(t);
    setEditName(t.name || "");
    setEditContact(t.contact || t.phone || "");
    setEditCnic(t.cnic || "");
    setEditStatus(((t.status || "occupied").toLowerCase() === "vacant") ? "vacant" : "occupied");
  };

  const handleSaveResident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTenant) return;
    const trimmed = editName.trim();
    if (!trimmed) {
      setToast({ type: "error", message: "Resident name cannot be empty" });
      return;
    }
    setIsUpdating(true);
    try {
      await api.updateTenant(editingTenant.id, {
        name: trimmed,
        contact: editContact.trim() || undefined,
        cnic: editCnic.trim() || undefined,
        status: editStatus,
      });
      qc.invalidateQueries({ queryKey: ["tenants"] });
      setToast({ type: "success", message: `Updated Flat ${editingTenant.unit.unit_no} (${trimmed} · ${editStatus})` });
      setEditingTenant(null);
      setTimeout(() => setToast(null), 3500);
    } catch (err) {
      setToast({ type: "error", message: (err as Error).message });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAutoPreview = () => {
    if (!selectedTenant || !autoAmount || Number(autoAmount) <= 0) return;
    const fee = Number(selectedTenant.total_monthly_maintenance || selectedTenant.monthly_maintenance_fee || 0);
    if (fee <= 0) return;
    const amount = Number(autoAmount);
    const monthsCount = Math.floor(amount / fee);
    const remainder = amount % fee;
    setAutoResult({
      months_count: monthsCount,
      remainder: remainder.toString(),
      total_applied: (amount - remainder).toString(),
    });
  };

  const handleToggleMonth = (targetIdx: number) => {
    if (unpaidMonths.length === 0) return;
    const targetKey = unpaidMonths[targetIdx].month_key;
    const isChecked = selectedMonths.has(targetKey);
    const isLastSelected = targetIdx === selectedMonths.size - 1;

    // Dues condition: must clear chronologically starting from earliest unpaid month
    if (isChecked && isLastSelected && selectedMonths.size > 1) {
      const next = new Set<string>();
      for (let i = 0; i < targetIdx; i++) {
        next.add(unpaidMonths[i].month_key);
      }
      setSelectedMonths(next);
    } else {
      const next = new Set<string>();
      for (let i = 0; i <= targetIdx; i++) {
        next.add(unpaidMonths[i].month_key);
      }
      setSelectedMonths(next);
    }
  };

  const handleSubmitPayment = async () => {
    if (!selectedTenant) return;
    setIsSubmitting(true);
    try {
      if (autoAllocateMode) {
        if (!autoAmount || Number(autoAmount) <= 0) {
          throw new Error("Enter a valid payment amount");
        }
        await api.autoAllocatePayment({
          occupant_id: selectedTenant.id,
          amount: autoAmount,
          credited_to: creditedTo,
          payment_mode: paymentMode,
          generated_by: generatedBy,
        });
        setToast({ type: "success", message: "Auto-allocated payment recorded successfully" });
      } else {
        if (selectedMonths.size === 0) {
          throw new Error("Please select at least one month");
        }
        const sortedKeys = Array.from(selectedMonths).sort();
        const formattedMonthNames = sortedKeys.map(formatMonthDisplay).join(", ");
        const total = selectedMonths.size * Number(selectedTenant.total_monthly_maintenance || selectedTenant.monthly_maintenance_fee);
        await api.createTransaction({
          date: new Date().toISOString(),
          amount: total.toString(),
          type: "INFLOW",
          category: "maintenance",
          occupant_id: selectedTenant.id,
          credited_to: creditedTo,
          payment_mode: paymentMode,
          generated_by: generatedBy,
          notes: `Maintenance fee for: ${formattedMonthNames}`,
        });
        setToast({ type: "success", message: `Payment for ${formattedMonthNames} logged successfully` });
      }
      qc.invalidateQueries({ queryKey: ["tenants"] });
      setSelectedTenant(null);
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast({ type: "error", message: (err as Error).message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Residents & Apartments
          </h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
            Directory of all building units, occupancy status, and monthly maintenance collections
          </p>
        </div>
        <div className="text-sm text-slate-500 dark:text-zinc-400 font-mono">
          Total: <span className="font-bold text-slate-900 dark:text-white">{tenants.length}</span> units
        </div>
      </div>

      {toast && (
        <div
          className={`rounded-xl px-4 py-3 text-sm font-medium border flex items-center justify-between ${
            toast.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-300"
              : "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-300"
          }`}
        >
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-black dark:hover:text-white">✕</button>
        </div>
      )}

      {/* Control Bar: Search & Status Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] shadow-sm">
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search flat #, name, or phone..."
            className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] px-4 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-black dark:focus:border-white transition-colors"
          />
        </div>

        {/* Segmented status filter */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/[0.04] p-1 rounded-lg border border-slate-200 dark:border-white/10">
          {(["ALL", "OVERDUE", "SETTLED"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-md px-3.5 py-1.5 text-sm font-bold transition-colors press-feedback ${
                statusFilter === s
                  ? "bg-black text-white dark:bg-white dark:text-black shadow-sm"
                  : "text-slate-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
              }`}
            >
              {s === "ALL" ? "All Units" : s === "OVERDUE" ? "Overdue" : "Settled"}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-zinc-400 font-bold uppercase text-xs bg-slate-50 dark:bg-white/[0.02]">
                <th className="py-3.5 px-4">Flat #</th>
                <th className="py-3.5 px-4">Resident</th>
                <th className="py-3.5 px-4 text-center">Occupancy</th>
                <th className="py-3.5 px-4">Contact</th>
                <th className="py-3.5 px-4 text-right">Base Fee</th>
                <th className="py-3.5 px-4 text-right">Cars (Fee)</th>
                <th className="py-3.5 px-4 text-right">Total Fee</th>
                <th className="py-3.5 px-4 text-center">Payment</th>
                <th className="py-3.5 px-4 text-right">Expected Dues</th>
                <th className="py-3.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={10} className="py-5 px-4"><div className="h-6 bg-slate-200 dark:bg-white/[0.03] rounded" /></td>
                  </tr>
                ))
              ) : filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400 dark:text-zinc-500">
                    No residents matching current criteria.
                  </td>
                </tr>
              ) : (
                filteredTenants.map((t, idx) => {
                  const status = computeStatus(t);
                  const isVacant = (t.status || "").toLowerCase() === "vacant";
                  return (
                    <tr key={`${t.id}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="py-4 px-4 font-mono font-bold text-slate-900 dark:text-white text-base">{t.unit.unit_no}</td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-900 dark:text-zinc-100 text-sm">{t.name}</span>
                          {isSuperAdmin && (
                            <button
                              type="button"
                              onClick={() => openEditModal(t)}
                              title="Edit resident (Super Admin only)"
                              className="p-1 rounded text-slate-400 hover:text-black dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                            >
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                          )}
                        </div>
                        {t.unit.is_rental && (
                          <span className="text-xs text-slate-500 dark:text-zinc-400 block mt-0.5">Tenant (Rental)</span>
                        )}
                      </td>

                      {/* Vacancy / Occupancy Status Selector */}
                      <td className="py-4 px-4 text-center">
                        <select
                          value={isVacant ? "vacant" : "occupied"}
                          onChange={async (e) => {
                            const nextStatus = e.target.value as "occupied" | "vacant";
                            try {
                              await api.updateTenantStatus(t.id, nextStatus);
                              qc.invalidateQueries({ queryKey: ["tenants"] });
                              setToast({
                                type: "success",
                                message: `Unit ${t.unit.unit_no} set to ${nextStatus === "vacant" ? "Vacant (₨ 4,000 base)" : "Occupied (₨ 5,500 base)"}`,
                              });
                            } catch (err) {
                              setToast({ type: "error", message: (err as Error).message });
                            }
                          }}
                          className={`rounded-lg px-2.5 py-1 text-xs font-bold border outline-none cursor-pointer transition-colors ${
                            isVacant
                              ? "bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300"
                              : "bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300"
                          }`}
                        >
                          <option value="occupied">Occupied</option>
                          <option value="vacant">Vacant</option>
                        </select>
                      </td>

                      <td className="py-4 px-4 text-slate-600 dark:text-zinc-300 font-mono text-sm">{t.contact || t.phone || "—"}</td>
                      <td className="py-4 px-4 text-right font-mono text-slate-800 dark:text-zinc-200 text-sm">
                        {fmt(t.monthly_maintenance_fee)}
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-slate-500 dark:text-zinc-400 text-sm">
                        {t.car_count || 1} {(t.car_count || 1) === 1 ? "car" : "cars"} ({fmt(t.extra_car_charges || 0)})
                      </td>
                      <td className="py-4 px-4 text-right font-mono font-bold text-slate-900 dark:text-white text-sm">
                        {fmt(t.total_monthly_maintenance != null ? t.total_monthly_maintenance : Number(t.monthly_maintenance_fee || 0) + Number(t.extra_car_charges || 0))}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold border ${
                            status === "Settled"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
                              : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20"
                          }`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right font-mono font-bold text-sm">
                        <span className={status === "Overdue" ? "text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-zinc-400"}>
                          {fmt(t.expected_dues)}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <button
                          onClick={() => setSelectedTenant(t)}
                          className="rounded-lg bg-slate-100 hover:bg-black hover:text-white text-slate-800 dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white dark:hover:text-black px-3.5 py-1.5 text-sm font-bold transition-colors press-feedback"
                        >
                          Collect
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Collection Modal */}
      {selectedTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Log Maintenance Inflow</h3>
                <p className="text-sm text-slate-500 dark:text-zinc-400">
                  Flat {selectedTenant.unit.unit_no} · {selectedTenant.name} ({((selectedTenant.status || "occupied").toLowerCase() === "vacant") ? "Vacant · ₨ 4,000 base" : "Occupied · ₨ 5,500 base"})
                </p>
              </div>
              <button
                onClick={() => setSelectedTenant(null)}
                className="p-1 text-slate-400 hover:text-black dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Mode switch */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-white/[0.04] rounded-lg border border-slate-200 dark:border-white/10">
              <button
                type="button"
                onClick={() => setAutoAllocateMode(false)}
                className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${
                  !autoAllocateMode
                    ? "bg-black text-white dark:bg-white dark:text-black shadow-sm"
                    : "text-slate-600 dark:text-zinc-400"
                }`}
              >
                Manual Selection
              </button>
              <button
                type="button"
                onClick={() => setAutoAllocateMode(true)}
                className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${
                  autoAllocateMode
                    ? "bg-black text-white dark:bg-white dark:text-black shadow-sm"
                    : "text-slate-600 dark:text-zinc-400"
                }`}
              >
                Auto-Allocate Lump Sum
              </button>
            </div>

            {autoAllocateMode ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1">
                    Received Amount (PKR)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={autoAmount}
                      onChange={(e) => setAutoAmount(e.target.value)}
                      placeholder="e.g. 15000"
                      className="flex-1 rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] px-4 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-black dark:focus:border-white"
                    />
                    <button
                      type="button"
                      onClick={handleAutoPreview}
                      className="rounded-lg border border-slate-300 dark:border-white/15 bg-slate-100 dark:bg-white/[0.08] px-4 py-2 text-sm font-bold text-slate-800 dark:text-white hover:bg-slate-200 dark:hover:bg-white/20 transition-colors"
                    >
                      Preview
                    </button>
                  </div>
                </div>

                {autoResult && (
                  <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] p-3.5 text-sm space-y-1">
                    <p className="font-bold text-slate-900 dark:text-white">Auto Allocation Summary:</p>
                    <p className="text-slate-600 dark:text-zinc-400">
                      Covers: <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{autoResult.months_count} month(s)</span> (₨{autoResult.total_applied})
                    </p>
                    <p className="text-slate-600 dark:text-zinc-400">
                      Unapplied Remainder: <span className="font-mono font-bold text-sky-600 dark:text-sky-400">{fmt(autoResult.remainder)}</span>
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
                    Select Months (Month & Year)
                  </label>
                  <span className="text-xs text-slate-500 dark:text-zinc-400">
                    Sequential selection from earliest due
                  </span>
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] p-2 space-y-1">
                  {unpaidMonths.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-zinc-400 p-2">No past unpaid months recorded. Advance payment can be logged.</p>
                  ) : (
                    unpaidMonths.map((m, idx) => {
                      const checked = selectedMonths.has(m.month_key);
                      return (
                        <div
                          key={m.month_key}
                          onClick={() => handleToggleMonth(idx)}
                          className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors ${
                            checked
                              ? "bg-emerald-50/80 border border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30"
                              : "hover:bg-slate-100 dark:hover:bg-white/[0.04] border border-transparent"
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                              {m.label || formatMonthDisplay(m.month_key)}
                            </span>
                            {m.is_due ? (
                              <span className="text-xs font-mono font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-500/20">
                                Due
                              </span>
                            ) : (
                              <span className="text-xs font-mono font-bold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 px-2 py-0.5 rounded border border-sky-200 dark:border-sky-500/20">
                                Advance
                              </span>
                            )}
                          </div>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleMonth(idx)}
                            className="w-4 h-4 rounded border-slate-300 text-black focus:ring-0 cursor-pointer"
                          />
                        </div>
                      );
                    })
                  )}
                </div>
                {selectedMonths.size > 0 && (
                  <div className="rounded-lg bg-slate-100 dark:bg-white/[0.04] p-3 text-sm flex items-center justify-between">
                    <span className="text-slate-600 dark:text-zinc-400 font-medium">
                      Selected ({selectedMonths.size} mo):
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white text-right truncate max-w-[280px]">
                      {Array.from(selectedMonths).sort().map(formatMonthDisplay).join(", ")}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Common Fields */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1">
                  Treasurer / Custodian
                </label>
                <select
                  value={creditedTo}
                  onChange={(e) => setCreditedTo(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0d131f] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
                >
                  {treasurers.map((tr) => (
                    <option key={tr} value={tr}>{tr}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1">
                  Payment Mode
                </label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0d131f] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
                >
                  <option value="cash">Cash in hand</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="online">Online App</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-white/10">
              <button
                type="button"
                onClick={() => setSelectedTenant(null)}
                className="rounded-lg border border-slate-300 dark:border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-zinc-400 hover:text-black dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSubmitPayment}
                className="rounded-lg bg-black text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-200 px-5 py-2.5 text-sm font-bold transition-colors press-feedback disabled:opacity-50"
              >
                {isSubmitting ? "Processing..." : "Confirm & Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Resident Modal (Super Admin only) */}
      {isSuperAdmin && editingTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Edit Resident — Flat {editingTenant.unit.unit_no}
                </h3>
                <p className="text-sm text-slate-500 dark:text-zinc-400">
                  Update resident identity and occupancy status.
                </p>
              </div>
              <button
                onClick={() => setEditingTenant(null)}
                className="p-1 text-slate-400 hover:text-black dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveResident} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-200 mb-1">
                  Resident Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Mr. Kashif Shamim"
                  className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-black dark:focus:border-white"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-200 mb-1">
                  Apartment Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as "occupied" | "vacant")}
                  className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0d131f] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-black dark:focus:border-white font-semibold"
                >
                  <option value="occupied">Occupied (₨ 5,500 base maintenance)</option>
                  <option value="vacant">Vacant (₨ 4,000 base maintenance)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-200 mb-1">
                  Phone / WhatsApp (Optional)
                </label>
                <input
                  type="text"
                  value={editContact}
                  onChange={(e) => setEditContact(e.target.value)}
                  placeholder="e.g. 0300-1234567"
                  className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-black dark:focus:border-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-200 mb-1">
                  CNIC (Optional)
                </label>
                <input
                  type="text"
                  value={editCnic}
                  onChange={(e) => setEditCnic(e.target.value)}
                  placeholder="e.g. 42101-1234567-1"
                  className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-black dark:focus:border-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setEditingTenant(null)}
                  className="rounded-lg border border-slate-300 dark:border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-zinc-400 hover:text-black dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="rounded-lg bg-black text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-200 px-5 py-2.5 text-sm font-bold transition-colors press-feedback disabled:opacity-50"
                >
                  {isUpdating ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
