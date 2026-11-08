"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Occupant } from "@/lib/types";

const EXTRA_MAINTENANCE_PER_ADDITIONAL_CAR = 2000;
const VACANT_BASE_FEE = 4000;
const OCCUPIED_BASE_FEE = 5500;

const formatAmount = (value: string | number | undefined): string =>
  `₨ ${parseFloat(String(value || "0")).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;

export default function ResidingAndParkingPage() {
  const qc = useQueryClient();
  const [editors, setEditors] = useState<Record<number, { carCount: number; status: "occupied" | "vacant" }>>({});
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["tenants"],
    queryFn: api.getTenants,
  });

  useEffect(() => {
    if (tenants.length === 0) return;
    setEditors((prev) => {
      const next: Record<number, { carCount: number; status: "occupied" | "vacant" }> = {};
      tenants.forEach((t) => {
        const isVacant = (t.status || "").toLowerCase() === "vacant" || Number(t.monthly_maintenance_fee) === VACANT_BASE_FEE;
        const initialStatus: "occupied" | "vacant" = isVacant ? "vacant" : "occupied";
        next[t.id] = prev[t.id] ?? {
          carCount: t.car_count ?? (isVacant ? 0 : 1),
          status: initialStatus,
        };
      });
      return next;
    });
  }, [tenants]);

  const totals = useMemo(() => {
    return tenants.reduce(
      (acc, tenant) => {
        const editor = editors[tenant.id];
        const status = editor?.status ?? (((tenant.status || "").toLowerCase() === "vacant") ? "vacant" : "occupied");
        const base = status === "vacant" ? VACANT_BASE_FEE : OCCUPIED_BASE_FEE;
        const carCount = editor?.carCount ?? (tenant.car_count || 1);
        const extraCars = Math.max(0, carCount - 1);
        const extraCharges = extraCars * EXTRA_MAINTENANCE_PER_ADDITIONAL_CAR;

        acc.extra += extraCharges;
        acc.total += base + extraCharges;
        if (status === "vacant") acc.vacantCount += 1;
        else acc.occupiedCount += 1;
        return acc;
      },
      { extra: 0, total: 0, vacantCount: 0, occupiedCount: 0 },
    );
  }, [tenants, editors]);

  const saveRow = async (tenant: Occupant) => {
    const editor = editors[tenant.id];
    if (!editor) return;
    const normalizedCars = Math.max(0, Number(editor.carCount || 0));

    try {
      setSavingId(tenant.id);
      await api.updateCarMaintenance(tenant.id, {
        car_count: normalizedCars,
        extra_car_maintenance_fee: EXTRA_MAINTENANCE_PER_ADDITIONAL_CAR.toFixed(2),
        status: editor.status,
      });
      qc.invalidateQueries({ queryKey: ["tenants"] });
      const statusLabel = editor.status === "vacant" ? "Vacant (₨ 4,000 base)" : "Occupied (₨ 5,500 base)";
      setToast({ type: "success", message: `Updated Unit ${tenant.unit.unit_no}: ${statusLabel}` });
    } catch (err) {
      setToast({ type: "error", message: (err as Error).message || "Failed to update." });
    } finally {
      setSavingId(null);
    }
  };

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Residing & Parking Maintenance
        </h2>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
          Occupied apartments carry a ₨ 5,500 base fee; Vacant apartments carry a ₨ 4,000 base fee. First vehicle is included; additional vehicles incur ₨ 2,000/month.
        </p>
      </div>

      {toast && (
        <div
          className={`rounded-xl px-4 py-3 text-xs font-medium border flex items-center justify-between ${
            toast.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-300"
              : "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-300"
          }`}
        >
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-black dark:hover:text-white">✕</button>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
            Occupancy Overview
          </p>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {totals.occupiedCount} <span className="text-xs font-sans text-slate-500">Occupied</span>
            </span>
            <span className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
              {totals.vacantCount} <span className="text-xs font-sans text-slate-500">Vacant</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">Total {tenants.length} apartment units</p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
            Total Extra Vehicle Charges
          </p>
          <p className="mt-2 text-2xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {formatAmount(totals.extra)}
          </p>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Monthly incremental parking fees</p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
            Total Expected Monthly Dues
          </p>
          <p className="mt-2 text-2xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {formatAmount(totals.total)}
          </p>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Combined expected collections (Base + Cars)</p>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-zinc-400 font-bold uppercase text-[10px] bg-slate-50 dark:bg-white/[0.02]">
                <th className="py-3 px-4">Flat #</th>
                <th className="py-3 px-4">Resident</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Base Fee</th>
                <th className="py-3 px-4 text-center">Vehicles Count</th>
                <th className="py-3 px-4 text-right">Extra Cars Fee</th>
                <th className="py-3 px-4 text-right">Total Maintenance</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={8} className="py-4 px-4"><div className="h-5 bg-slate-200 dark:bg-white/[0.03] rounded" /></td>
                  </tr>
                ))
              ) : (
                tenants.map((t, idx) => {
                  const editor = editors[t.id];
                  const currentStatus = editor?.status ?? (((t.status || "").toLowerCase() === "vacant") ? "vacant" : "occupied");
                  const carCount = editor?.carCount ?? (t.car_count ?? (currentStatus === "vacant" ? 0 : 1));
                  const isSaving = savingId === t.id;
                  const rowBaseFee = currentStatus === "vacant" ? VACANT_BASE_FEE : OCCUPIED_BASE_FEE;
                  const extraCars = Math.max(0, carCount - 1);
                  const extraCarsFee = extraCars * EXTRA_MAINTENANCE_PER_ADDITIONAL_CAR;
                  const totalMaintenance = rowBaseFee + extraCarsFee;

                  return (
                    <tr key={`${t.id}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">{t.unit.unit_no}</td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-zinc-100">{t.name}</td>
                      
                      {/* Status Selector */}
                      <td className="py-3.5 px-4 text-center">
                        <select
                          value={currentStatus}
                          onChange={(e) => {
                            const newStatus = e.target.value as "occupied" | "vacant";
                            setEditors((prev) => ({
                              ...prev,
                              [t.id]: {
                                status: newStatus,
                                carCount: newStatus === "vacant" ? 0 : Math.max(1, carCount),
                              },
                            }));
                          }}
                          className={`rounded-lg px-2.5 py-1 text-xs font-bold border outline-none cursor-pointer transition-colors ${
                            currentStatus === "vacant"
                              ? "bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300"
                              : "bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300"
                          }`}
                        >
                          <option value="occupied">Occupied</option>
                          <option value="vacant">Vacant</option>
                        </select>
                      </td>

                      {/* Base Fee */}
                      <td className="py-3.5 px-4 text-right font-mono text-slate-700 dark:text-zinc-300">
                        {formatAmount(rowBaseFee)}
                      </td>

                      {/* Vehicles Counter */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex items-center gap-1.5 bg-slate-100 dark:bg-white/[0.04] p-1 rounded-lg border border-slate-200 dark:border-white/10">
                          <button
                            type="button"
                            onClick={() =>
                              setEditors((prev) => ({
                                ...prev,
                                [t.id]: {
                                  status: currentStatus,
                                  carCount: Math.max(0, carCount - 1),
                                },
                              }))
                            }
                            className="w-6 h-6 rounded bg-white hover:bg-slate-200 text-black dark:bg-white/10 dark:hover:bg-white/20 dark:text-white flex items-center justify-center font-bold text-xs"
                          >
                            -
                          </button>
                          <span className="w-6 text-center font-mono font-bold text-slate-900 dark:text-white">{carCount}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setEditors((prev) => ({
                                ...prev,
                                [t.id]: {
                                  status: currentStatus,
                                  carCount: carCount + 1,
                                },
                              }))
                            }
                            className="w-6 h-6 rounded bg-white hover:bg-slate-200 text-black dark:bg-white/10 dark:hover:bg-white/20 dark:text-white flex items-center justify-center font-bold text-xs"
                          >
                            +
                          </button>
                        </div>
                      </td>

                      {/* Extra Cars Fee */}
                      <td className="py-3.5 px-4 text-right font-mono text-slate-600 dark:text-zinc-300">
                        {formatAmount(extraCarsFee)}
                      </td>

                      {/* Total Maintenance */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {formatAmount(totalMaintenance)}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => saveRow(t)}
                          className="rounded-lg bg-slate-100 hover:bg-black hover:text-white text-slate-800 dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white dark:hover:text-black px-3 py-1.5 text-xs font-bold transition-colors press-feedback disabled:opacity-50"
                        >
                          {isSaving ? "Saving..." : "Save"}
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
    </div>
  );
}
