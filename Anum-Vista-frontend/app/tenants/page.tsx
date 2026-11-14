"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, UnpaidMonth } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Occupant, Transaction } from "@/lib/types";

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

const computeStatus = (t: Occupant): "Overdue" | "Settled" | "Advance" => {
  if (t.payment_status === "Advance" || t.payment_status === "Settled" || t.payment_status === "Overdue") {
    return t.payment_status;
  }
  if (!t.last_paid_month) return "Overdue";
  const now = new Date();
  const cur = new Date(now.getFullYear(), now.getMonth(), 1);
  const lp = new Date(t.last_paid_month);
  if (Number.isNaN(lp.getTime())) return "Overdue";
  const paidMonth = new Date(lp.getFullYear(), lp.getMonth(), 1);
  if (paidMonth < cur) return "Overdue";
  if (paidMonth > cur) return "Advance";
  return "Settled";
};

const MAINTENANCE_RECEIVER = "Naveed";

export default function TenantsPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OVERDUE" | "SETTLED" | "ADVANCE">("ALL");
  const [selectedTenant, setSelectedTenant] = useState<Occupant | null>(null);
  const [editingTenant, setEditingTenant] = useState<Occupant | null>(null);
  const [editName, setEditName] = useState("");
  const [editContact, setEditContact] = useState("");
  const [editCnic, setEditCnic] = useState("");
  const [editStatus, setEditStatus] = useState<"occupied" | "vacant">("occupied");
  const [editBaseFee, setEditBaseFee] = useState("");
  const [isRental, setIsRental] = useState(false);
  const [tenantName, setTenantName] = useState("");
  const [tenantContact, setTenantContact] = useState("");
  const [tenantCnic, setTenantCnic] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [creditedTo] = useState<string>(MAINTENANCE_RECEIVER);
  const [generatedBy] = useState<"Naveed" | "Dilshad" | "System">("Naveed");
  const [paymentMode, setPaymentMode] = useState<string>("cash");
  const [autoAllocateMode, setAutoAllocateMode] = useState(false);
  const [autoAmount, setAutoAmount] = useState("");
  const [autoResult, setAutoResult] = useState<{ months_count: number; remainder: string; total_applied: string } | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());
  const [unpaidMonths, setUnpaidMonths] = useState<UnpaidMonth[]>([]);
  const [unpaidTotalOverdue, setUnpaidTotalOverdue] = useState<number>(0);
  const [unpaidPartialCredit, setUnpaidPartialCredit] = useState<number>(0);
  const [manualAmount, setManualAmount] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Receipts history & Super Admin Restore
  const [historyTenant, setHistoryTenant] = useState<Occupant | null>(null);
  const [historyTxns, setHistoryTxns] = useState<Transaction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<Transaction | null>(null);
  const [restoreReason, setRestoreReason] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["tenants"],
    queryFn: api.getTenants,
  });

  useEffect(() => {
    if (!selectedTenant) {
      setUnpaidMonths([]);
      setSelectedMonths(new Set());
      setManualAmount("");
      setUnpaidTotalOverdue(0);
      setUnpaidPartialCredit(0);
      setAutoResult(null);
      return;
    }
    api.getUnpaidMonths(selectedTenant.id).then((r) => {
      setUnpaidMonths(r.months);
      setUnpaidTotalOverdue(Number(r.total_overdue || selectedTenant.expected_dues || 0));
      setUnpaidPartialCredit(Number(r.partial_paid_amount || 0));
      if (r.months.length > 0) {
        setSelectedMonths(new Set([r.months[0].month_key]));
        const firstAmt = Number(r.months[0].remaining_amount ?? selectedTenant.total_monthly_maintenance ?? selectedTenant.monthly_maintenance_fee ?? 0);
        setManualAmount(firstAmt > 0 ? String(firstAmt) : "");
      }
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
        (t.tenant_name && t.tenant_name.toLowerCase().includes(q)) ||
        t.unit.unit_no.toLowerCase().includes(q) ||
        (t.contact || "").includes(q) ||
        (t.tenant_contact || "").includes(q);
      const st = computeStatus(t);
      const matchStatus =
        statusFilter === "ALL" ||
        (statusFilter === "OVERDUE" && st === "Overdue") ||
        (statusFilter === "SETTLED" && st === "Settled") ||
        (statusFilter === "ADVANCE" && st === "Advance");
      return matchSearch && matchStatus;
    });
  }, [tenants, search, statusFilter]);

  const openEditModal = (t: Occupant) => {
    setEditingTenant(t);
    setEditName(t.name || "");
    setEditContact(t.contact || t.phone || "");
    setEditCnic(t.cnic || "");
    setEditStatus(((t.status || "occupied").toLowerCase() === "vacant") ? "vacant" : "occupied");
    setEditBaseFee(String(Number(t.monthly_maintenance_fee || 5500)));
    setIsRental(Boolean(t.is_rental || t.unit?.is_rental || t.tenant_name));
    setTenantName(t.tenant_name || "");
    setTenantContact(t.tenant_contact || "");
    setTenantCnic(t.tenant_cnic || "");
    setEditError(null);
  };

  const handleSaveResident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTenant) return;
    const trimmed = editName.trim();
    if (!trimmed) {
      setEditError("Resident name cannot be empty");
      setToast({ type: "error", message: "Resident name cannot be empty" });
      return;
    }
    setIsUpdating(true);
    setEditError(null);
    try {
      await api.updateTenant(editingTenant.id, {
        name: trimmed,
        contact: editContact.trim() || undefined,
        cnic: editCnic.trim() || undefined,
        status: editStatus,
        monthly_maintenance_fee: editBaseFee !== "" && !Number.isNaN(Number(editBaseFee)) ? Number(editBaseFee).toFixed(2) : undefined,
        is_rental: isRental,
        tenant_name: isRental ? (tenantName.trim() || undefined) : undefined,
        tenant_contact: isRental ? (tenantContact.trim() || undefined) : undefined,
        tenant_cnic: isRental ? (tenantCnic.trim() || undefined) : undefined,
      });
      qc.invalidateQueries({ queryKey: ["tenants"] });
      setToast({ type: "success", message: `Updated Flat ${editingTenant.unit.unit_no} (${trimmed} · ${editStatus})` });
      setEditingTenant(null);
      setTimeout(() => setToast(null), 3500);
    } catch (err) {
      const msg = (err as Error).message || "Failed to update resident";
      setEditError(msg);
      setToast({ type: "error", message: msg });
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

  const sumSelectedMonths = (keys: Set<string>) => {
    return unpaidMonths
      .filter((m) => keys.has(m.month_key))
      .reduce((acc, m) => {
        const fallbackFee = Number(selectedTenant?.total_monthly_maintenance || selectedTenant?.monthly_maintenance_fee || 0);
        return acc + Number(m.remaining_amount ?? m.monthly_fee ?? fallbackFee);
      }, 0);
  };

  const handleToggleMonth = (targetIdx: number) => {
    if (unpaidMonths.length === 0) return;
    const targetKey = unpaidMonths[targetIdx].month_key;
    const isChecked = selectedMonths.has(targetKey);
    const isLastSelected = targetIdx === selectedMonths.size - 1;

    // Dues condition: must clear chronologically starting from earliest unpaid month
    const next = new Set<string>();
    if (isChecked && isLastSelected && selectedMonths.size > 1) {
      for (let i = 0; i < targetIdx; i++) {
        next.add(unpaidMonths[i].month_key);
      }
    } else {
      for (let i = 0; i <= targetIdx; i++) {
        next.add(unpaidMonths[i].month_key);
      }
    }
    setSelectedMonths(next);
    const nextSum = sumSelectedMonths(next);
    setManualAmount(nextSum > 0 ? String(nextSum) : "");
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
          credited_to: MAINTENANCE_RECEIVER,
          payment_mode: paymentMode,
          generated_by: generatedBy,
        });
        setToast({ type: "success", message: "Auto-allocated payment recorded successfully" });
      } else {
        if (selectedMonths.size === 0) {
          throw new Error("Please select at least one month");
        }
        const amtNum = Number(manualAmount);
        if (!manualAmount || Number.isNaN(amtNum) || amtNum <= 0) {
          throw new Error("Enter a valid payment amount");
        }
        const sortedKeys = Array.from(selectedMonths).sort();
        const formattedMonthNames = sortedKeys.map(formatMonthDisplay).join(", ");
        await api.createReceiptV2({
          occupant_id: selectedTenant.id,
          months: sortedKeys,
          amount: amtNum.toFixed(2),
          credited_to: MAINTENANCE_RECEIVER,
          payment_mode: paymentMode,
          generated_by: generatedBy,
        });
        setToast({
          type: "success",
          message: isSuperAdmin
            ? `Receipt logged for ${formattedMonthNames}`
            : `Receipt submitted for approval (${formattedMonthNames})`,
        });
      }
      qc.invalidateQueries({ queryKey: ["tenants"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      setSelectedTenant(null);
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast({ type: "error", message: (err as Error).message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openResidentHistory = async (tenant: Occupant) => {
    setHistoryTenant(tenant);
    setLoadingHistory(true);
    try {
      const allTxns = await api.getTransactions();
      setHistoryTxns(allTxns.filter((t) => t.occupant_id === tenant.id));
    } catch (err) {
      setToast({ type: "error", message: (err as Error).message });
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleRestoreMaintenance = async () => {
    if (!restoreTarget) return;
    const reason = restoreReason.trim();
    if (!reason) {
      setToast({ type: "error", message: "Please provide a compulsory restore reason." });
      return;
    }
    setIsRestoring(true);
    try {
      await api.restoreTransaction(restoreTarget.id, reason);
      await qc.invalidateQueries({ queryKey: ["tenants"] });
      await qc.invalidateQueries({ queryKey: ["transactions"] });
      if (historyTenant) {
        const refreshed = await api.getTransactions();
        setHistoryTxns(refreshed.filter((t) => t.occupant_id === historyTenant.id));
      }
      setRestoreTarget(null);
      setRestoreReason("");
      setToast({
        type: "success",
        message: `Receipt ${restoreTarget.receipt_no || `#${restoreTarget.id}`} restored. Treasurer adjusted & dues reopened.`,
      });
      setTimeout(() => setToast(null), 4000);
    } catch (err) {
      setToast({ type: "error", message: (err as Error).message });
    } finally {
      setIsRestoring(false);
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
          className={`fixed top-5 right-5 z-[9999] max-w-md shadow-2xl rounded-xl px-4 py-3 text-sm font-medium border flex items-center gap-3 transition-all ${
            toast.type === "success"
              ? "bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-[#062419] dark:border-emerald-600 dark:text-emerald-200"
              : "bg-rose-50 border-rose-300 text-rose-900 dark:bg-[#280c12] dark:border-rose-600 dark:text-rose-200"
          }`}
        >
          <span className="flex-1">{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-black dark:hover:text-white p-1">✕</button>
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
          {(["ALL", "OVERDUE", "SETTLED", "ADVANCE"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-md px-3.5 py-1.5 text-sm font-bold transition-colors press-feedback ${
                statusFilter === s
                  ? "bg-black text-white dark:bg-white dark:text-black shadow-sm"
                  : "text-slate-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
              }`}
            >
              {s === "ALL" ? "All Units" : s === "OVERDUE" ? "Overdue" : s === "SETTLED" ? "Settled" : "Advance"}
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
                        {(t.is_rental || t.tenant_name) && (
                          <div className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                            <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-zinc-300">
                              <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-white/10">Tenant</span>
                              <span className="font-semibold text-slate-800 dark:text-zinc-200">{t.tenant_name || "—"}</span>
                            </div>
                            {(t.tenant_contact || t.tenant_cnic) && (
                              <div className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                                {t.tenant_contact && <span>Ph: {t.tenant_contact}</span>}
                                {t.tenant_contact && t.tenant_cnic && <span> · </span>}
                                {t.tenant_cnic && <span>CNIC: {t.tenant_cnic}</span>}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Vacancy / Occupancy Status Selector */}
                      <td className="py-4 px-4 text-center">
                        {isSuperAdmin ? (
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
                        ) : (
                          <span
                            className={`inline-block rounded-lg px-2.5 py-1 text-xs font-bold border ${
                              isVacant
                                ? "bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300"
                                : "bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300"
                            }`}
                          >
                            {isVacant ? "Vacant" : "Occupied"}
                          </span>
                        )}
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
                              : status === "Advance"
                              ? "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/20"
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
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => setSelectedTenant(t)}
                            className="rounded-lg bg-slate-100 hover:bg-black hover:text-white text-slate-800 dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white dark:hover:text-black px-3.5 py-1.5 text-sm font-bold transition-colors press-feedback"
                          >
                            Collect
                          </button>
                          {isSuperAdmin && (
                            <button
                              onClick={() => openResidentHistory(t)}
                              className="rounded-lg border border-slate-200 dark:border-white/15 px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/10"
                            >
                              Receipts
                            </button>
                          )}
                        </div>
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
              <div className="space-y-3">
                {unpaidTotalOverdue > 0 && (
                  <div className="rounded-lg border border-rose-200 dark:border-rose-500/20 bg-rose-50/70 dark:bg-rose-500/10 px-3 py-2 text-xs flex items-center justify-between">
                    <span className="font-semibold text-rose-800 dark:text-rose-300">Total Current Overdue:</span>
                    <span className="font-mono font-bold text-rose-700 dark:text-rose-300">{fmt(unpaidTotalOverdue)}</span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
                    Select Months (Month & Year)
                  </label>
                  <span className="text-xs text-slate-500 dark:text-zinc-400">
                    Sequential selection from earliest unpaid
                  </span>
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] p-2 space-y-1">
                  {unpaidMonths.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-zinc-400 p-2">All available months for this period are paid.</p>
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
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
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
                            {m.is_partial && (
                              <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                                Paid: {fmt(m.paid_amount || 0)} · Remaining: {fmt(m.remaining_amount || 0)}
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1">
                      Amount Collecting (PKR)
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={manualAmount}
                      onChange={(e) => setManualAmount(e.target.value)}
                      placeholder="Enter amount received"
                      className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] px-3.5 py-2 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none focus:border-black dark:focus:border-white"
                    />
                  </div>
                  {unpaidTotalOverdue > 0 && (
                    <div className="rounded-lg bg-slate-100 dark:bg-white/[0.04] px-3 py-2 text-xs">
                      <div className="text-slate-500 dark:text-zinc-400">Remaining Overdue After Payment</div>
                      <div className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                        {fmt(Math.max(0, unpaidTotalOverdue - Number(manualAmount || 0)))}
                      </div>
                    </div>
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
                  Received By (Treasurer)
                </label>
                <input
                  type="text"
                  value={`${creditedTo} (Maintenance Receiver)`}
                  readOnly
                  className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/[0.04] px-3.5 py-2.5 text-sm font-semibold text-slate-700 dark:text-zinc-300 outline-none cursor-not-allowed"
                />
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
              {editError && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-800 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-300 p-3 text-xs font-semibold flex items-center justify-between">
                  <span>{editError}</span>
                  <button type="button" onClick={() => setEditError(null)} className="text-slate-400 hover:text-rose-900">✕</button>
                </div>
              )}
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
                  onChange={(e) => {
                    const next = e.target.value as "occupied" | "vacant";
                    setEditStatus(next);
                    setEditBaseFee(next === "vacant" ? "4000" : "5500");
                  }}
                  className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0d131f] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-black dark:focus:border-white font-semibold"
                >
                  <option value="occupied">Occupied (Default ₨ 5,500 base)</option>
                  <option value="vacant">Vacant (Default ₨ 4,000 base)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-200 mb-1">
                  Base Maintenance Fee (PKR)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={editBaseFee}
                  onChange={(e) => setEditBaseFee(e.target.value)}
                  placeholder="e.g. 5500"
                  className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] px-4 py-2.5 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none focus:border-black dark:focus:border-white"
                />
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

              {/* Rented to Tenant toggle & inputs */}
              <div className="pt-3 border-t border-slate-100 dark:border-white/10 space-y-3">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isRental}
                    onChange={(e) => setIsRental(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-black focus:ring-0 dark:border-white/20"
                  />
                  <span className="text-sm font-bold text-slate-800 dark:text-zinc-200">
                    Rented to Tenant
                  </span>
                </label>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Enable if this flat is currently rented to a tenant.
                </p>

                {isRental && (
                  <div className="space-y-3 pl-3 border-l-2 border-slate-200 dark:border-white/20 mt-2">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 mb-1">
                        Tenant Name
                      </label>
                      <input
                        type="text"
                        value={tenantName}
                        onChange={(e) => setTenantName(e.target.value)}
                        placeholder="e.g. Tenant Full Name"
                        className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] px-3.5 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-black dark:focus:border-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 mb-1">
                        Tenant Phone / WhatsApp
                      </label>
                      <input
                        type="text"
                        value={tenantContact}
                        onChange={(e) => setTenantContact(e.target.value)}
                        placeholder="e.g. 0300-9876543"
                        className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] px-3.5 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-black dark:focus:border-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 mb-1">
                        Tenant CNIC
                      </label>
                      <input
                        type="text"
                        value={tenantCnic}
                        onChange={(e) => setTenantCnic(e.target.value)}
                        placeholder="e.g. 42101-9876543-1"
                        className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] px-3.5 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-black dark:focus:border-white"
                      />
                    </div>
                  </div>
                )}
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

      {/* Resident Maintenance Receipts & Super Admin Restore Modal */}
      {historyTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Flat {historyTenant.unit.unit_no} · {historyTenant.name} — Receipts
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Approved receipts can be restored (Super Admin only) with a compulsory reason note to reopen pending dues.
                </p>
              </div>
              <button onClick={() => setHistoryTenant(null)} className="text-slate-400 hover:text-black dark:hover:text-white">✕</button>
            </div>

            {loadingHistory ? (
              <div className="py-8 text-center text-sm text-slate-400">Loading receipts...</div>
            ) : historyTxns.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">No recorded receipts for this resident.</div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-white/10">
                {historyTxns.map((tx) => {
                  const st = tx.status || "approved";
                  return (
                    <div key={tx.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                            {tx.receipt_no || `TXN-${tx.id}`}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            st === "approved"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                              : st === "restored"
                              ? "bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300"
                              : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-zinc-400"
                          }`}>
                            {st}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                          {new Date(tx.date).toLocaleDateString("en-PK", { month: "short", year: "numeric" })} · {tx.notes || "Maintenance"} · Treasurer: {tx.credited_to || "—"}
                        </div>
                        {tx.restore_reason && (
                          <div className="text-xs text-purple-700 dark:text-purple-300 mt-0.5">
                            Restored reason: {tx.restore_reason}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono font-bold text-sm text-slate-900 dark:text-white mr-1">
                          {fmt(tx.amount)}
                        </span>
                        <button
                          onClick={() => {
                            const url = api.getReceiptUrl(tx.id);
                            const token = localStorage.getItem("av_token") || "";
                            window.open(`${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`, "_blank", "noopener");
                          }}
                          className="rounded-lg border border-slate-200 dark:border-white/15 px-2.5 py-1 text-xs font-bold text-slate-700 dark:text-zinc-200"
                        >
                          PDF
                        </button>
                        {isSuperAdmin && st === "approved" && (
                          <button
                            onClick={() => {
                              setRestoreTarget(tx);
                              setRestoreReason("");
                            }}
                            className="rounded-lg bg-purple-50 border border-purple-200 text-purple-700 dark:bg-purple-500/10 dark:border-purple-500/30 dark:text-purple-300 px-2.5 py-1 text-xs font-bold hover:bg-purple-100"
                          >
                            Restore
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Restore Compulsory Note Modal */}
      {restoreTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Restore Maintenance Receipt
            </h3>
            <p className="text-sm text-slate-600 dark:text-zinc-300">
              Restoring <span className="font-mono font-bold">{restoreTarget.receipt_no || `#${restoreTarget.id}`}</span> ({fmt(restoreTarget.amount)}) deducts the amount from <span className="font-bold">{restoreTarget.credited_to || "treasury"}</span>, reopens pending dues, and logs this action in Audit Trail.
            </p>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1">
                Compulsory Reason / Note *
              </label>
              <textarea
                rows={3}
                value={restoreReason}
                onChange={(e) => setRestoreReason(e.target.value)}
                placeholder="Explain why this receipt is being restored (required)..."
                className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] p-2.5 text-sm text-slate-900 dark:text-white outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setRestoreTarget(null)} className="rounded-lg border px-4 py-2 text-xs font-bold text-slate-600 dark:text-zinc-300">
                Cancel
              </button>
              <button
                onClick={handleRestoreMaintenance}
                disabled={isRestoring || !restoreReason.trim()}
                className="rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-4 py-2 text-xs font-bold"
              >
                {isRestoring ? "Restoring..." : "Confirm Restore"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
