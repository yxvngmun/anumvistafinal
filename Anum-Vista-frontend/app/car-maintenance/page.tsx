"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Occupant } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";

const EXTRA_MAINTENANCE_PER_ADDITIONAL_CAR = 2000;
const VACANT_BASE_FEE = 4000;
const OCCUPIED_BASE_FEE = 5500;

const formatAmount = (value: string | number | undefined): string =>
  `₨ ${parseFloat(String(value || "0")).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;

export default function CarsAndParkingPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const router = useRouter();
  const qc = useQueryClient();
  const [editors, setEditors] = useState<Record<number, { carCount: number }>>({});
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [pendingNavHref, setPendingNavHref] = useState<string | null>(null);
  const bypassGuardRef = useRef(false);

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

  const dirtyRows = useMemo(() => {
    if (!isSuperAdmin) return [];
    return tenants.filter((t) => {
      const editor = editors[t.id];
      if (!editor) return false;
      const savedCount = t.car_count ?? 1;
      return editor.carCount !== savedCount;
    });
  }, [tenants, editors, isSuperAdmin]);

  const hasUnsavedChanges = dirtyRows.length > 0;

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
    if (!isSuperAdmin) {
      setToast({ type: "error", message: "Only Super Admin can change vehicle count" });
      return;
    }
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
      await qc.invalidateQueries({ queryKey: ["tenants"] });
      setToast({ type: "success", message: `Updated Unit ${tenant.unit.unit_no}: ${normalizedCars} vehicle(s)` });
    } catch (err) {
      setToast({ type: "error", message: (err as Error).message || "Failed to update." });
    } finally {
      setSavingId(null);
    }
  };

  const discardAllChanges = useCallback(() => {
    setEditors(() => {
      const reset: Record<number, { carCount: number }> = {};
      tenants.forEach((t) => {
        reset[t.id] = { carCount: t.car_count ?? 1 };
      });
      return reset;
    });
  }, [tenants]);

  const saveAllDirty = async (): Promise<boolean> => {
    if (!isSuperAdmin || dirtyRows.length === 0) return true;
    try {
      setIsSavingAll(true);
      for (const tenant of dirtyRows) {
        const normalizedCars = Math.max(0, Number(editors[tenant.id]?.carCount ?? tenant.car_count ?? 1));
        await api.updateCarMaintenance(tenant.id, {
          car_count: normalizedCars,
          extra_car_maintenance_fee: EXTRA_MAINTENANCE_PER_ADDITIONAL_CAR.toFixed(2),
          status: tenant.status || "occupied",
        });
      }
      await qc.invalidateQueries({ queryKey: ["tenants"] });
      setToast({
        type: "success",
        message: `Saved ${dirtyRows.length} vehicle update(s) successfully.`,
      });
      return true;
    } catch (err) {
      setToast({
        type: "error",
        message: (err as Error).message || "Failed to save all changes.",
      });
      return false;
    } finally {
      setIsSavingAll(false);
    }
  };

  const proceedToNavigation = useCallback(
    (target: string) => {
      bypassGuardRef.current = true;
      setPendingNavHref(null);
      if (target === "__BACK__") {
        window.history.back();
      } else {
        router.push(target);
      }
    },
    [router],
  );

  // Prevent browser refresh / tab close when there are unsaved changes
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (bypassGuardRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Intercept in-app link clicks when there are unsaved changes
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handleDocumentClick = (e: MouseEvent) => {
      if (bypassGuardRef.current) return;
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const hrefAttr = anchor.getAttribute("href");
      if (!hrefAttr || hrefAttr.startsWith("#") || hrefAttr.startsWith("mailto:") || hrefAttr.startsWith("tel:")) {
        return;
      }

      try {
        const destUrl = new URL(anchor.href, window.location.origin);
        if (destUrl.origin !== window.location.origin) return;
        const nextPath = `${destUrl.pathname}${destUrl.search}${destUrl.hash}`;
        const currPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (nextPath === currPath) return;

        e.preventDefault();
        e.stopPropagation();
        setPendingNavHref(nextPath);
      } catch {
        // Ignore malformed URLs
      }
    };
    document.addEventListener("click", handleDocumentClick, true);
    return () => document.removeEventListener("click", handleDocumentClick, true);
  }, [hasUnsavedChanges]);

  // Intercept browser Back / Forward button when there are unsaved changes
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handlePopState = () => {
      if (bypassGuardRef.current) return;
      window.history.pushState(null, "", window.location.href);
      setPendingNavHref("__BACK__");
    };
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [hasUnsavedChanges]);

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

      {/* Unsaved Changes Banner */}
      {hasUnsavedChanges && (
        <div className="sticky top-2 z-30 rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/80 px-4 py-3 shadow-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              You have {dirtyRows.length} unsaved change{dirtyRows.length > 1 ? "s" : ""}{" "}
              <span className="font-normal text-amber-800 dark:text-amber-300">
                ({dirtyRows.map((d) => `Flat ${d.unit.unit_no}`).join(", ")})
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSavingAll}
              onClick={discardAllChanges}
              className="rounded-lg border border-amber-300 dark:border-amber-500/30 bg-white dark:bg-white/10 px-3.5 py-1.5 text-xs font-bold text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-white/20 transition-colors disabled:opacity-50"
            >
              Discard All
            </button>
            <button
              type="button"
              disabled={isSavingAll}
              onClick={saveAllDirty}
              className="rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-4 py-1.5 text-xs font-bold transition-colors shadow-sm disabled:opacity-50"
            >
              {isSavingAll ? "Saving..." : "Save All Changes"}
            </button>
          </div>
        </div>
      )}

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
                  const savedCount = t.car_count ?? 1;
                  const carCount = editor?.carCount ?? savedCount;
                  const isDirty = isSuperAdmin && carCount !== savedCount;
                  const isSaving = savingId === t.id;
                  const rowBaseFee = isVacant ? VACANT_BASE_FEE : OCCUPIED_BASE_FEE;
                  const extraCars = Math.max(0, carCount - 1);
                  const extraCarsFee = extraCars * EXTRA_MAINTENANCE_PER_ADDITIONAL_CAR;
                  const totalMaintenance = rowBaseFee + extraCarsFee;

                  return (
                    <tr
                      key={`${t.id}-${idx}`}
                      className={`transition-colors ${
                        isDirty
                          ? "bg-amber-50/90 dark:bg-amber-500/15 border-l-4 border-l-amber-500 hover:bg-amber-100/80 dark:hover:bg-amber-500/20"
                          : "hover:bg-slate-50 dark:hover:bg-white/[0.02]"
                      }`}
                    >
                      <td className="py-4 px-4 font-mono font-bold text-slate-900 dark:text-white text-base">
                        <div className="flex items-center gap-2">
                          <span>{t.unit.unit_no}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4 font-semibold text-slate-900 dark:text-zinc-100 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{t.name}</span>
                          {isVacant && (
                            <span className="text-xs font-bold text-amber-700 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-500/20">
                              Vacant
                            </span>
                          )}
                          {isDirty && (
                            <span className="text-xs font-bold text-amber-800 bg-amber-200/80 dark:bg-amber-500/30 dark:text-amber-200 px-2 py-0.5 rounded border border-amber-400 dark:border-amber-400/50">
                              Unsaved ({savedCount} → {carCount})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Base Fee */}
                      <td className="py-4 px-4 text-right font-mono text-slate-700 dark:text-zinc-300 text-sm">
                        {formatAmount(rowBaseFee)}
                      </td>

                      {/* Vehicles Counter */}
                      <td className="py-4 px-4 text-center">
                        {isSuperAdmin ? (
                          <div
                            className={`inline-flex items-center gap-2 p-1.5 rounded-lg border ${
                              isDirty
                                ? "bg-white dark:bg-white/10 border-amber-400 dark:border-amber-400/60 ring-2 ring-amber-400/30"
                                : "bg-slate-100 dark:bg-white/[0.04] border-slate-200 dark:border-white/10"
                            }`}
                          >
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
                        ) : (
                          <span className="inline-block px-3 py-1 font-mono font-bold text-sm text-slate-800 dark:text-zinc-200 bg-slate-100 dark:bg-white/[0.04] rounded-lg border border-slate-200 dark:border-white/10">
                            {carCount} {carCount === 1 ? "car" : "cars"}
                          </span>
                        )}
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
                        {isSuperAdmin ? (
                          <div className="inline-flex items-center gap-2">
                            {isDirty && (
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() =>
                                  setEditors((prev) => ({
                                    ...prev,
                                    [t.id]: { carCount: savedCount },
                                  }))
                                }
                                title="Reset to saved value"
                                className="rounded-lg border border-slate-300 dark:border-white/15 px-2.5 py-2 text-xs font-semibold text-slate-600 dark:text-zinc-300 hover:bg-white dark:hover:bg-white/10 transition-colors"
                              >
                                Reset
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => saveRow(t)}
                              className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors press-feedback disabled:opacity-50 ${
                                isDirty
                                  ? "bg-amber-600 hover:bg-amber-700 text-white shadow-sm ring-2 ring-amber-400/50"
                                  : "bg-black text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-200"
                              }`}
                            >
                              {isSaving ? "Saving..." : isDirty ? "Save*" : "Save"}
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-zinc-500 font-medium">Read-only</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unsaved Changes Leave Confirmation Modal */}
      {pendingNavHref !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Unsaved Vehicle Changes
                </h3>
                <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
                  You have modified vehicle counts that haven&apos;t been saved yet. Would you like to save or discard your changes before leaving?
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingNavHref(null)}
                className="p-1 text-slate-400 hover:text-black dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="max-h-40 overflow-y-auto rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-500/10 p-3 space-y-1.5">
              {dirtyRows.map((d) => {
                const oldVal = d.car_count ?? 1;
                const newVal = editors[d.id]?.carCount ?? oldVal;
                return (
                  <div key={d.id} className="flex items-center justify-between text-xs font-medium text-amber-900 dark:text-amber-200">
                    <span>
                      <span className="font-mono font-bold">Flat {d.unit.unit_no}</span> · {d.name}
                    </span>
                    <span className="font-mono font-bold">
                      {oldVal} → {newVal} {newVal === 1 ? "car" : "cars"}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-2 border-t border-slate-100 dark:border-white/10">
              <button
                type="button"
                disabled={isSavingAll}
                onClick={() => setPendingNavHref(null)}
                className="rounded-lg border border-slate-300 dark:border-white/15 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors"
              >
                Stay on Page
              </button>
              <button
                type="button"
                disabled={isSavingAll}
                onClick={() => {
                  const target = pendingNavHref;
                  discardAllChanges();
                  if (target) proceedToNavigation(target);
                }}
                className="rounded-lg border border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/10 px-4 py-2 text-sm font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors disabled:opacity-50"
              >
                Discard Changes
              </button>
              <button
                type="button"
                disabled={isSavingAll}
                onClick={async () => {
                  const target = pendingNavHref;
                  const ok = await saveAllDirty();
                  if (ok && target) {
                    proceedToNavigation(target);
                  }
                }}
                className="rounded-lg bg-black text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-200 px-4 py-2 text-sm font-bold transition-colors press-feedback disabled:opacity-50"
              >
                {isSavingAll ? "Saving..." : "Save & Leave"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
