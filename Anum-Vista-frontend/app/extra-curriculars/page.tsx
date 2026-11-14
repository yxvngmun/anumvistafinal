"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { ExtraCurricularSourceSummary, Transaction } from "@/lib/types";

const fmt = (v: string | number) =>
  `₨ ${Number(v || 0).toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;

const DEFAULT_TREASURERS = ["Naveed", "Dilshad", "Danish"];

const CYCLE_LABELS: Record<string, string> = {
  quarterly: "Quarterly",
  half_yearly: "Half Yearly",
  yearly: "Yearly",
  one_time: "Per Event / One-Time",
};

const statusBadgeStyles: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
  pending: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
  rejected: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20",
  cancelled: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/5 dark:text-zinc-400 dark:border-white/10",
  restored: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20",
};

function defaultPeriodForCycle(cycle: string, year: number): string {
  const m = new Date().getMonth() + 1;
  if (cycle === "quarterly") {
    const q = Math.ceil(m / 3);
    return `Q${q} ${year}`;
  }
  if (cycle === "half_yearly") {
    return m <= 6 ? `H1 ${year}` : `H2 ${year}`;
  }
  if (cycle === "yearly") {
    return `${year}`;
  }
  return new Date().toLocaleString("en-US", { month: "short", year: "numeric" });
}

export default function ExtraCurricularsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const isSuperAdmin = user?.role === "super_admin";
  const isSeniorAdmin = user?.role === "senior_admin";
  const isMaster = ["superadmin", "anumvista"].includes((user?.username || "").toLowerCase());
  const canCollectAdvert = isSeniorAdmin || isMaster;
  const canCollectHallAndOther = isSuperAdmin || isMaster;
  const qc = useQueryClient();

  useEffect(() => {
    if (!authLoading && user && user.role === "admin") {
      router.push("/tenants");
    }
  }, [authLoading, user, router]);

  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [sourceFilter, setSourceFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Treasurers (operational receivers only; Ali & Asif are storage custodians only)
  const [treasurers, setTreasurers] = useState<string[]>(DEFAULT_TREASURERS);
  useEffect(() => {
    api.getTreasurers().then((r) => {
      if (r.operational_treasurers?.length) setTreasurers(r.operational_treasurers);
    }).catch(() => {});
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["extra-curriculars", selectedYear],
    queryFn: () => api.getExtraCurriculars(selectedYear),
  });

  // Collect Modal state
  const [collectOpen, setCollectOpen] = useState(false);
  const [selectedSourceCode, setSelectedSourceCode] = useState<string>("community_hall");
  const [customOtherName, setCustomOtherName] = useState("");
  const [collectAmount, setCollectAmount] = useState("");
  const [collectDate, setCollectDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [billingCycle, setBillingCycle] = useState<"quarterly" | "half_yearly" | "yearly" | "one_time">("quarterly");
  const [periodLabel, setPeriodLabel] = useState(() => defaultPeriodForCycle("quarterly", 2026));
  const [creditedTo, setCreditedTo] = useState(DEFAULT_TREASURERS[0]);
  const [paymentMode, setPaymentMode] = useState("cash");
  const [notes, setNotes] = useState("");
  const [isCollecting, setIsCollecting] = useState(false);

  // Edit Contract Modal (Super Admin)
  const [editingSource, setEditingSource] = useState<ExtraCurricularSourceSummary | null>(null);
  const [editName, setEditName] = useState("");
  const [editCycle, setEditCycle] = useState<"quarterly" | "half_yearly" | "yearly" | "one_time">("quarterly");
  const [editAnnualAmount, setEditAnnualAmount] = useState("");
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Restore Modal (Super Admin only, compulsory reason)
  const [restoreTarget, setRestoreTarget] = useState<Transaction | null>(null);
  const [restoreReason, setRestoreReason] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);

  const sources = data?.sources ?? [];
  const transactions = data?.transactions ?? [];

  const advertSources = useMemo(
    () => sources.filter((s) => s.source_type === "advert"),
    [sources],
  );
  const coreRowSources = useMemo(() => {
    const order = ["community_hall", "other_shop_maint_a", "advert_1", "advert_2", "advert_3", "advert_4"];
    const byCode = new Map(sources.map((s) => [s.code, s]));
    return order.map((c) => byCode.get(c)).filter((s): s is ExtraCurricularSourceSummary => Boolean(s));
  }, [sources]);
  const collectableSources = useMemo(() => {
    return sources.filter((s) => {
      if (s.source_type === "advert") return canCollectAdvert;
      return canCollectHallAndOther;
    });
  }, [sources, canCollectAdvert, canCollectHallAndOther]);

  const openCollectFor = (src?: ExtraCurricularSourceSummary) => {
    const code = src ? src.code : "other";
    const cycle = (src?.billing_cycle as "quarterly" | "half_yearly" | "yearly" | "one_time") || "one_time";
    setSelectedSourceCode(code);
    setCustomOtherName("");
    setBillingCycle(cycle);
    setPeriodLabel(defaultPeriodForCycle(cycle, selectedYear || new Date().getFullYear()));
    setCollectAmount(code === "community_hall" ? "8000" : "");
    setCollectDate(new Date().toISOString().split("T")[0]);
    const isAdv = src?.source_type === "advert";
    setCreditedTo(isAdv ? "Dilshad" : "Naveed");
    setPaymentMode("cash");
    setNotes(code === "community_hall" ? "Community Hall (With AC)" : "");
    setCollectOpen(true);
  };

  const handleSourceSelectChange = (code: string) => {
    setSelectedSourceCode(code);
    const match = sources.find((s) => s.code === code);
    if (match) {
      const cycle = (match.billing_cycle as "quarterly" | "half_yearly" | "yearly" | "one_time") || "yearly";
      setBillingCycle(cycle);
      setPeriodLabel(defaultPeriodForCycle(cycle, selectedYear || new Date().getFullYear()));
      setCreditedTo(match.source_type === "advert" ? "Dilshad" : "Naveed");
      if (code === "community_hall") {
        setCollectAmount("8000");
        setNotes("Community Hall (With AC)");
      } else {
        setNotes("");
      }
    } else if (code === "other") {
      setBillingCycle("one_time");
      setPeriodLabel(defaultPeriodForCycle("one_time", selectedYear || new Date().getFullYear()));
      setCreditedTo("Naveed");
      setNotes("");
    }
  };

  const handleCollectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmt = Number(collectAmount);
    if (!collectAmount || Number.isNaN(numAmt) || numAmt <= 0) {
      setToast({ type: "error", message: "Please insert a valid received amount greater than 0." });
      return;
    }
    if (selectedSourceCode === "other" && !customOtherName.trim()) {
      setToast({ type: "error", message: "Please enter the inflow method/source name (e.g. Selling Scraps)." });
      return;
    }
    setIsCollecting(true);
    try {
      const matched = sources.find((s) => s.code === selectedSourceCode);
      await api.collectExtraCurricular({
        source_id: matched ? matched.id : undefined,
        source_code: selectedSourceCode,
        custom_source_name: selectedSourceCode === "other" ? customOtherName.trim() : undefined,
        amount: numAmt.toFixed(2),
        date: `${collectDate}T12:00:00`,
        billing_cycle: billingCycle,
        period_label: periodLabel.trim() || undefined,
        credited_to: creditedTo,
        payment_mode: paymentMode,
        generated_by: user?.username || "System",
        notes: notes.trim() || undefined,
      });
      await qc.invalidateQueries({ queryKey: ["extra-curriculars"] });
      await qc.invalidateQueries({ queryKey: ["transactions"] });
      await qc.invalidateQueries({ queryKey: ["treasury-current"] });
      setCollectOpen(false);
      setToast({
        type: "success",
        message: isSuperAdmin
          ? "Extra curricular inflow recorded and credited to treasurer."
          : "Inflow submitted for Super Admin approval.",
      });
      setTimeout(() => setToast(null), 4000);
    } catch (err) {
      setToast({ type: "error", message: (err as Error).message });
    } finally {
      setIsCollecting(false);
    }
  };

  const handleSaveContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSource) return;
    setIsSavingConfig(true);
    try {
      await api.updateExtraCurricularSource(editingSource.id, {
        name: editName.trim(),
        billing_cycle: editCycle,
        annual_fixed_amount: Number(editAnnualAmount || 0).toFixed(2),
      });
      await qc.invalidateQueries({ queryKey: ["extra-curriculars"] });
      setEditingSource(null);
      setToast({ type: "success", message: `Updated ${editName} annual target & billing schedule.` });
      setTimeout(() => setToast(null), 3500);
    } catch (err) {
      setToast({ type: "error", message: (err as Error).message });
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleRestoreConfirm = async () => {
    if (!restoreTarget) return;
    const reason = restoreReason.trim();
    if (!reason) {
      setToast({ type: "error", message: "A compulsory note explaining why it is being restored is required." });
      return;
    }
    setIsRestoring(true);
    try {
      await api.restoreTransaction(restoreTarget.id, reason);
      await qc.invalidateQueries({ queryKey: ["extra-curriculars"] });
      await qc.invalidateQueries({ queryKey: ["transactions"] });
      await qc.invalidateQueries({ queryKey: ["treasury-current"] });
      await qc.invalidateQueries({ queryKey: ["audit-logs"] });
      setRestoreTarget(null);
      setRestoreReason("");
      setToast({
        type: "success",
        message: `Receipt ${restoreTarget.receipt_no || `#${restoreTarget.id}`} restored, reversed from treasurer, and logged.`,
      });
      setTimeout(() => setToast(null), 4000);
    } catch (err) {
      setToast({ type: "error", message: (err as Error).message });
    } finally {
      setIsRestoring(false);
    }
  };

  const filteredTxns = useMemo(() => {
    return transactions.filter((t) => {
      if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
      if (sourceFilter !== "ALL") {
        const matched = sources.find((s) => s.code === sourceFilter);
        if (matched && t.extra_source_id !== matched.id) return false;
      }
      return true;
    });
  }, [transactions, statusFilter, sourceFilter, sources]);

  const totalApprovedForYear = useMemo(
    () =>
      sources.reduce((sum, s) => sum + Number(s.total_received || 0), 0),
    [sources],
  );

  const handleOpenReceipt = (txnId: number) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("av_token") : "";
    const url = api.getReceiptUrl(txnId);
    const sep = url.includes("?") ? "&" : "?";
    window.open(`${url}${sep}token=${encodeURIComponent(token || "")}`, "_blank", "noopener");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Extra Curriculars
          </h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
            Community Hall, Adverts 1–4 (annual fixed targets ÷ 12 monthly breakdown), and Custom / Other inflows
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0d131f] px-3 py-2 text-sm font-semibold text-slate-800 dark:text-white"
          >
            <option value={2026}>Year 2026</option>
            <option value={2025}>Year 2025</option>
            <option value={2024}>Year 2024</option>
            <option value={2023}>Year 2023</option>
            <option value={0}>All Years</option>
          </select>

          {canCollectHallAndOther && (
            <button
              onClick={() => openCollectFor(undefined)}
              className="rounded-lg bg-black hover:bg-slate-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-black px-4 py-2 text-sm font-bold shadow-sm transition-colors press-feedback"
            >
              + Others (Custom Method)
            </button>
          )}
        </div>
      </div>

      {toast && (
        <div
          className={`fixed top-5 right-5 z-[9999] max-w-md shadow-2xl rounded-xl px-4 py-3 text-sm font-medium border flex items-center gap-3 ${
            toast.type === "success"
              ? "bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-[#062419] dark:border-emerald-600 dark:text-emerald-200"
              : "bg-rose-50 border-rose-300 text-rose-900 dark:bg-[#280c12] dark:border-rose-600 dark:text-rose-200"
          }`}
        >
          <span className="flex-1">{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-black dark:hover:text-white p-1">✕</button>
        </div>
      )}

      {/* Summary Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-4 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
            Total Collected ({selectedYear === 0 ? "All Time" : selectedYear})
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
            {fmt(totalApprovedForYear)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-4 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
            Advertisements Monthly Avg (Total ÷ 12)
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-1">
            {fmt(advertSources.reduce((s, a) => s + Number(a.received_per_month || 0), 0))}
          </div>
        </div>
      </div>

      {/* Row-Based Extra Curricular Modules */}
      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Extra Curricular Modules
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Naveed handles Community Hall, Shop Rental &amp; Others · Dilshad handles Advert 1–4
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-zinc-400 font-bold uppercase text-xs bg-slate-50 dark:bg-white/[0.02]">
                <th className="py-3 px-4">Module</th>
                <th className="py-3 px-4">Schedule / Rate</th>
                <th className="py-3 px-4 text-right">Annual Target</th>
                <th className="py-3 px-4 text-right">Received ({selectedYear || "All"})</th>
                <th className="py-3 px-4 text-right">Received ÷ 12</th>
                <th className="py-3 px-4 text-right">Remaining ÷ 12</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">Loading modules...</td>
                </tr>
              ) : (
                coreRowSources.map((src) => {
                  const isAdv = src.source_type === "advert";
                  const canCollectRow = isAdv ? canCollectAdvert : canCollectHallAndOther;
                  const canEditRow = isAdv && (isSeniorAdmin || isMaster);
                  return (
                    <tr key={src.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 dark:text-white">{src.name}</div>
                        <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                          Receiver: {isAdv ? "Dilshad" : "Naveed"}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-zinc-300">
                        <span className="rounded-full px-2.5 py-0.5 font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/20">
                          {CYCLE_LABELS[src.billing_cycle] || src.billing_cycle}
                        </span>
                        {src.code === "community_hall" && (
                          <div className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1">
                            With AC: ₨ 8,000 · Without AC: ₨ 4,000
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs font-semibold text-slate-700 dark:text-zinc-300">
                        {isAdv ? fmt(src.annual_fixed_amount) : "—"}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {fmt(src.total_received)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-700 dark:text-zinc-300">
                        {isAdv ? `${fmt(src.received_per_month)}/mo` : "—"}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs font-semibold text-rose-600 dark:text-rose-400">
                        {isAdv ? `${fmt(src.remaining_per_month)}/mo` : "—"}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {canEditRow && (
                            <button
                              onClick={() => {
                                setEditingSource(src);
                                setEditName(src.name);
                                setEditCycle(src.billing_cycle as "quarterly" | "half_yearly" | "yearly" | "one_time");
                                setEditAnnualAmount(String(src.annual_fixed_amount));
                              }}
                              className="rounded-lg border border-slate-200 dark:border-white/15 px-2.5 py-1 text-xs font-bold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/10"
                            >
                              Edit Target
                            </button>
                          )}
                          {canCollectRow ? (
                            <button
                              onClick={() => openCollectFor(src)}
                              className="rounded-lg bg-black dark:bg-white text-white dark:text-black px-3 py-1 text-xs font-bold hover:opacity-85 press-feedback"
                            >
                              Collect
                            </button>
                          ) : (
                            <span className="text-[11px] font-semibold text-slate-400 dark:text-zinc-500 px-2">
                              View Only
                            </span>
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

      {/* Extra Curricular Receipts / Transactions Table */}
      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] overflow-hidden shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-slate-200 dark:border-white/10">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Extra Curricular Payment History
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              All inflows collected (including imported Excel records). Super Admin can restore accidental entries with a compulsory note.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0d131f] px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-white"
            >
              <option value="ALL">All Sources</option>
              {sources.map((s) => (
                <option key={s.id} value={s.code}>{s.name}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0d131f] px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-white"
            >
              <option value="ALL">All Statuses</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="restored">Restored</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-zinc-400 font-bold uppercase text-xs bg-slate-50 dark:bg-white/[0.02]">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Source</th>
                <th className="py-3 px-4">Period / Method</th>
                <th className="py-3 px-4">Receipt #</th>
                <th className="py-3 px-4">Received / Treasurer</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
              {filteredTxns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 dark:text-zinc-500">
                    No extra curricular transactions match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredTxns.map((t) => {
                  const st = t.status || "approved";
                  return (
                    <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-600 dark:text-zinc-300">
                        {new Date(t.date).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white text-sm">
                          {t.extra_source_name || t.notes || "Extra Curricular"}
                        </div>
                        {t.notes && t.notes !== t.extra_source_name && (
                          <div className="text-xs text-slate-500 dark:text-zinc-400">{t.notes}</div>
                        )}
                        {t.restore_reason && (
                          <div className="text-xs text-purple-700 dark:text-purple-300 mt-0.5">
                            Restored reason: {t.restore_reason}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-zinc-300">
                        <div>{t.period_label || "—"}</div>
                        <div className="text-slate-400">{CYCLE_LABELS[t.billing_cycle || ""] || t.billing_cycle || "—"}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-600 dark:text-zinc-300">
                        {t.receipt_no || `TXN-${t.id}`}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-zinc-300">
                        <div>By: <span className="font-semibold">{t.generated_by || "System"}</span></div>
                        <div>Credited: <span className="font-semibold">{t.credited_to || "—"}</span></div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold border uppercase ${statusBadgeStyles[st] || statusBadgeStyles.approved}`}>
                          {st}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-sm text-slate-900 dark:text-white">
                        {fmt(t.amount)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => handleOpenReceipt(t.id)}
                            className="rounded-lg border border-slate-200 dark:border-white/15 px-2.5 py-1 text-xs font-bold text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/10"
                          >
                            Receipt
                          </button>
                          {isSuperAdmin && st === "approved" && (
                            <button
                              onClick={() => {
                                setRestoreTarget(t);
                                setRestoreReason("");
                              }}
                              className="rounded-lg border border-purple-300 dark:border-purple-500/30 bg-purple-50 dark:bg-purple-500/10 px-2.5 py-1 text-xs font-bold text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-500/20"
                            >
                              Restore
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

      {/* Collect Payment Modal */}
      {collectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <form
            onSubmit={handleCollectSubmit}
            className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Collect Extra Curricular Inflow
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Manually insert amount received and assign period/date schedule
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCollectOpen(false)}
                className="p-1 text-slate-400 hover:text-black dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1">
                  Revenue Source
                </label>
                <select
                  value={selectedSourceCode}
                  onChange={(e) => handleSourceSelectChange(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0d131f] px-3 py-2 text-sm text-slate-900 dark:text-white"
                >
                  {collectableSources.map((s) => (
                    <option key={s.id} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                  {canCollectHallAndOther && <option value="other">+ Others (Enter New Inflow Method)</option>}
                </select>
              </div>

              {selectedSourceCode === "community_hall" && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1.5">
                    Community Hall Option
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCollectAmount("8000");
                        setNotes("Community Hall (With AC)");
                      }}
                      className={`rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
                        collectAmount === "8000"
                          ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                          : "border-slate-300 dark:border-white/15 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-white/5"
                      }`}
                    >
                      With AC — ₨ 8,000
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCollectAmount("4000");
                        setNotes("Community Hall (Without AC)");
                      }}
                      className={`rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
                        collectAmount === "4000"
                          ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                          : "border-slate-300 dark:border-white/15 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-white/5"
                      }`}
                    >
                      Without AC — ₨ 4,000
                    </button>
                  </div>
                </div>
              )}

              {selectedSourceCode === "other" && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1">
                    Custom Method / Source Name *
                  </label>
                  <input
                    type="text"
                    value={customOtherName}
                    onChange={(e) => setCustomOtherName(e.target.value)}
                    placeholder="e.g. Selling Scraps, Event Fee, Generator Recovery"
                    required
                    className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1">
                  Received Amount (PKR) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={collectAmount}
                  onChange={(e) => setCollectAmount(e.target.value)}
                  placeholder="Insert amount received"
                  required
                  className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] px-3 py-2 text-sm font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1">
                  Payment Date *
                </label>
                <input
                  type="date"
                  value={collectDate}
                  onChange={(e) => setCollectDate(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1">
                  Date / Billing Method
                </label>
                <select
                  value={billingCycle}
                  onChange={(e) => {
                    const c = e.target.value as "quarterly" | "half_yearly" | "yearly" | "one_time";
                    setBillingCycle(c);
                    setPeriodLabel(defaultPeriodForCycle(c, new Date(collectDate).getFullYear() || 2026));
                  }}
                  className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0d131f] px-3 py-2 text-sm text-slate-900 dark:text-white"
                >
                  <option value="quarterly">Quarterly</option>
                  <option value="half_yearly">Half Yearly</option>
                  <option value="yearly">Yearly</option>
                  <option value="one_time">One-Time / Per Receipt</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1">
                  Period Label
                </label>
                <input
                  type="text"
                  value={periodLabel}
                  onChange={(e) => setPeriodLabel(e.target.value)}
                  placeholder="e.g. Q3 2026, H1 2026, 2026"
                  className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1">
                  Credited To (Treasurer)
                </label>
                {sources.find((s) => s.code === selectedSourceCode)?.source_type === "advert" ? (
                  <input
                    type="text"
                    value="Dilshad (Advert Receiver Only)"
                    readOnly
                    className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-700 dark:text-zinc-300 cursor-not-allowed"
                  />
                ) : (
                  <input
                    type="text"
                    value="Naveed (Extra Curricular Receiver)"
                    readOnly
                    className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-700 dark:text-zinc-300 cursor-not-allowed"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1">
                  Payment Mode
                </label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0d131f] px-3 py-2 text-sm text-slate-900 dark:text-white"
                >
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="online">Online</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1">
                  Notes / Remarks
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional reference or details"
                  className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-white/10">
              <button
                type="button"
                onClick={() => setCollectOpen(false)}
                className="rounded-lg border border-slate-200 dark:border-white/15 px-4 py-2 text-sm font-bold text-slate-600 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCollecting}
                className="rounded-lg bg-black dark:bg-white text-white dark:text-black px-5 py-2 text-sm font-bold disabled:opacity-50 press-feedback"
              >
                {isCollecting ? "Submitting..." : isSuperAdmin ? "Record & Credit Treasurer" : "Submit for Approval"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Super Admin Edit Annual Target & Billing Method Modal */}
      {editingSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <form
            onSubmit={handleSaveContract}
            className="w-full max-w-md rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Configure Annual Target & Schedule
              </h3>
              <button type="button" onClick={() => setEditingSource(null)} className="text-slate-400">✕</button>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1">
                Billing Date Method
              </label>
              <select
                value={editCycle}
                onChange={(e) => setEditCycle(e.target.value as "quarterly" | "half_yearly" | "yearly" | "one_time")}
                className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0d131f] px-3 py-2 text-sm text-slate-900 dark:text-white"
              >
                <option value="quarterly">Quarterly</option>
                <option value="half_yearly">Half Yearly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1">
                Fixed Annual Amount (PKR)
              </label>
              <input
                type="number"
                step="0.01"
                value={editAnnualAmount}
                onChange={(e) => setEditAnnualAmount(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] px-3 py-2 text-sm font-mono text-slate-900 dark:text-white"
              />
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                Monthly equivalent (÷ 12): {fmt(Number(editAnnualAmount || 0) / 12)}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-white/10">
              <button type="button" onClick={() => setEditingSource(null)} className="rounded-lg border px-4 py-2 text-sm font-bold text-slate-600 dark:text-zinc-300">
                Cancel
              </button>
              <button type="submit" disabled={isSavingConfig} className="rounded-lg bg-black dark:bg-white text-white dark:text-black px-5 py-2 text-sm font-bold">
                {isSavingConfig ? "Saving..." : "Save Configuration"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Restore Modal (Super Admin Only, Compulsory Reason) */}
      {restoreTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Restore Inflow Entry
              </h3>
              <button onClick={() => setRestoreTarget(null)} className="text-slate-400">✕</button>
            </div>
            <p className="text-sm text-slate-600 dark:text-zinc-300">
              Restoring <span className="font-bold">{restoreTarget.extra_source_name || restoreTarget.notes}</span> ({fmt(restoreTarget.amount)}) will deduct the amount from{" "}
              <span className="font-bold">{restoreTarget.credited_to || "treasury"}</span>, reopen the pending balance, and record this reversal in the Audit Trail.
            </p>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1">
                Compulsory Reason / Note *
              </label>
              <textarea
                rows={3}
                value={restoreReason}
                onChange={(e) => setRestoreReason(e.target.value)}
                placeholder="Explain why this entry is being restored (required)..."
                className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-white/10">
              <button onClick={() => setRestoreTarget(null)} className="rounded-lg border px-4 py-2 text-sm font-bold text-slate-600 dark:text-zinc-300">
                Cancel
              </button>
              <button
                onClick={handleRestoreConfirm}
                disabled={isRestoring || !restoreReason.trim()}
                className="rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-5 py-2 text-sm font-bold"
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

