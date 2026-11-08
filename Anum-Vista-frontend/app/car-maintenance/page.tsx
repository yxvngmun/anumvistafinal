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

export default function CarsAndParkingPage() {
  const qc = useQueryClient();
  const [editors, setEditors] = useState<Record<number, { carCount: number }>>({});
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["tenants"],
    queryFn: api.getTenants,
  });

  useEffect(() => {
    if (tenants.length === 0) return;
    setEditors((prev) => {
      const next: Record<number, { carCount: number }> = {};
      tenants.forEach((t) => {
        next[t.id] = prev[t.id] ?? {
          carCount: t.car_count ?? 1,
        };
      });
      return next;
    });
  }, [tenants]);

  const totals = useMemo(() => {
    return tenants.reduce(
      (acc, tenant) => {
        const editor = editors[tenant.id];
        const isVacant = (tenant.status || "").toLowerCase() === "vacant";
        const base = isVacant ? VACANT_BASE_FEE : OCCUPIED_BASE_FEE;
        const carCount = editor?.carCount ?? (tenant.car_count ?? 1);
        const extraCars = Math.max(0, carCount - 1);
        const extraCharges = extraCars * EXTRA_MAINTENANCE_PER_ADDITIONAL_CAR;

        acc.totalCars += carCount;
        acc.extraCars += extraCars;
        acc.extraCharges += extraCharges;
        acc.totalMaintenance += base + extraCharges;
        return acc;
      },
      { totalCars: 0, extraCars: 0, extraCharges: 0, totalMaintenance: 0 },
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
        status: tenant.status || "occupied",
      });
      qc.invalidateQueries({ queryKey: ["tenants"] });
      setToast({ type: "success", message: `Updated Unit ${tenant.unit.unit_no}: ${normalizedCars} vehicle(s)` });
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
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Cars & Parking
        </h2>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
          Manage resident vehicle allocations and extra parking fees. First vehicle is included; each additional vehicle is ₨ 2,000/month.
        </p>
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

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
            Total Vehicles Registered
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono text-slate-900 dark:text-white">
              {totals.totalCars}
            </span>
            <span className="text-sm font-sans text-slate-500 dark:text-zinc-400">vehicles</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">Across all building units</p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
            Extra Vehicle Charges
          </p>
          <p className="mt-2 text-3xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
            {formatAmount(totals.extraCharges)}
          </p>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">{totals.extraCars} chargeable extra vehicle(s)</p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
            Total Combined Maintenance
          </p>
          <p className="mt-2 text-3xl font-extrabold font-mono text-slate-900 dark:text-white tabular-nums">
            {formatAmount(totals.totalMaintenance)}
          </p>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">Base maintenance + extra parking</p>
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
                <th className="py-3.5 px-4 text-right">Base Fee</th>
                <th className="py-3.5 px-4 text-center">Vehicles Count</th>
                <th className="py-3.5 px-4 text-right">Extra Cars Fee</th>
                <th className="py-3.5 px-4 text-right">Total Maintenance</th>
                <th className="py-3.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={7} className="py-5 px-4"><div className="h-6 bg-slate-200 dark:bg-white/[0.03] rounded" /></td>
                  </tr>
                ))
              ) : (
                tenants.map((t, idx) => {
                  const editor = editors[t.id];
                  const isVacant = (t.status || "").toLowerCase() === "vacant";
                  const carCount = editor?.carCount ?? (t.car_count ?? 1);
                  const isSaving = savingId === t.id;
                  const rowBaseFee = isVacant ? VACANT_BASE_FEE : OCCUPIED_BASE_FEE;
                  const extraCars = Math.max(0, carCount - 1);
                  const extraCarsFee = extraCars * EXTRA_MAINTENANCE_PER_ADDITIONAL_CAR;
                  const totalMaintenance = rowBaseFee + extraCarsFee;

                  return (
                    <tr key={`${t.id}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="py-4 px-4 font-mono font-bold text-slate-900 dark:text-white text-base">{t.unit.unit_no}</td>
                      <td className="py-4 px-4 font-semibold text-slate-900 dark:text-zinc-100 text-sm">
                        {t.name}
                        {isVacant && (
                          <span className="ml-2 text-xs font-bold text-amber-700 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-500/20">
                            Vacant
                          </span>
                        )}
                      </td>

                      {/* Base Fee */}
                      <td className="py-4 px-4 text-right font-mono text-slate-700 dark:text-zinc-300 text-sm">
                        {formatAmount(rowBaseFee)}
                      </td>

                      {/* Vehicles Counter */}
                      <td className="py-4 px-4 text-center">
                        <div className="inline-flex items-center gap-2 bg-slate-100 dark:bg-white/[0.04] p-1.5 rounded-lg border border-slate-200 dark:border-white/10">
                          <button
                            type="button"
                            onClick={() =>
                              setEditors((prev) => ({
                                ...prev,
                                [t.id]: {
                                  carCount: Math.max(0, carCount - 1),
                                },
                              }))
                            }
                            className="w-7 h-7 rounded flex items-center justify-center font-bold text-slate-600 hover:text-black hover:bg-white dark:text-zinc-300 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
                          >
                            –
                          </button>
                          <span className="w-8 text-center font-mono font-bold text-sm text-slate-900 dark:text-white">
                            {carCount}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setEditors((prev) => ({
                                ...prev,
                                [t.id]: {
                                  carCount: carCount + 1,
                                },
                              }))
                            }
                            className="w-7 h-7 rounded flex items-center justify-center font-bold text-slate-600 hover:text-black hover:bg-white dark:text-zinc-300 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </td>

                      {/* Extra Cars Fee */}
                      <td className="py-4 px-4 text-right font-mono text-slate-600 dark:text-zinc-400 text-sm">
                        {extraCars > 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                            +{formatAmount(extraCarsFee)}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-zinc-600">₨ 0</span>
                        )}
                      </td>

                      {/* Total Maintenance */}
                      <td className="py-4 px-4 text-right font-mono font-bold text-slate-900 dark:text-white text-base">
                        {formatAmount(totalMaintenance)}
                      </td>

                      {/* Action */}
                      <td className="py-4 px-4 text-right">
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => saveRow(t)}
                          className="rounded-lg bg-black text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-200 px-4 py-2 text-sm font-bold transition-colors press-feedback disabled:opacity-50"
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
