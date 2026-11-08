"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api, DueReminderEntry, DueRemindersOut } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

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

export default function RemindersPage() {
  const { user, isAuthenticated } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [whatsappStatus, setWhatsappStatus] = useState<Record<number, "sending" | "sent" | "error">>({});

  const { data, isLoading } = useQuery<DueRemindersOut>({
    queryKey: ["reminders", "due"],
    queryFn: api.getDueReminders,
    enabled: isAuthenticated,
  });

  const { data: waConfig } = useQuery({
    queryKey: ["whatsapp", "config"],
    queryFn: api.getWhatsAppConfig,
    enabled: isAuthenticated,
    retry: false,
  });

  const generateMutation = useMutation({
    mutationFn: api.generateDueReminders,
    onSuccess: (resp) => {
      setToast({ type: "success", message: resp.message });
      setTimeout(() => setToast(null), 3000);
    },
    onError: (e) => {
      setToast({ type: "error", message: (e as Error).message });
      setTimeout(() => setToast(null), 3000);
    },
  });

  const sendWhatsApp = async (entry: DueReminderEntry) => {
    if (!entry.contact) return;
    setWhatsappStatus((prev) => ({ ...prev, [entry.occupant_id]: "sending" }));
    try {
      const formattedMonths = entry.unpaid_months.map(formatMonthDisplay).join(", ");
      const message = `Dear ${entry.name},\n\nMaintenance dues of ${fmt(entry.total_due)} (${entry.months_overdue} months) for Unit ${entry.unit_no} are pending.\nUnpaid months: ${formattedMonths}\n\nPlease clear payment.\n\nAnum Vista Management`;
      await api.sendWhatsAppReminder({
        occupant_id: entry.occupant_id,
        phone: entry.contact,
        message,
      });
      setWhatsappStatus((prev) => ({ ...prev, [entry.occupant_id]: "sent" }));
    } catch {
      setWhatsappStatus((prev) => ({ ...prev, [entry.occupant_id]: "error" }));
    }
  };

  const filtered = (data?.entries ?? []).filter((e) => {
    const q = search.trim().toLowerCase();
    return !q || e.name.toLowerCase().includes(q) || e.unit_no.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">Due Reminders & WhatsApp</h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Automated notifications for overdue residents</p>
        </div>

        {isSuperAdmin && (
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="rounded-xl bg-black dark:bg-white text-white dark:text-zinc-950 px-3.5 py-1.5 text-xs font-semibold hover:bg-slate-800 dark:hover:bg-zinc-100 transition-colors press-feedback disabled:opacity-50 shadow-sm"
          >
            {generateMutation.isPending ? "Generating..." : "Generate In-App Alerts"}
          </button>
        )}
      </div>

      {toast && (
        <div
          className={`rounded-xl px-4 py-2.5 text-xs font-medium border ${
            toast.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300"
              : "bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20 text-rose-800 dark:text-rose-300"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* WhatsApp Configuration Banner */}
      <div className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] text-xs shadow-sm">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-slate-600 dark:text-zinc-300">WhatsApp Gateway:</span>
          <span className="font-mono text-slate-900 dark:text-white font-medium capitalize">
            {waConfig?.provider || "Direct Web Link"}
          </span>
        </div>
        <span className="text-[11px] text-slate-500 dark:text-zinc-400">
          {data?.total_residents_due || 0} residents overdue
        </span>
      </div>

      {/* Search */}
      <div className="max-w-xs">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter residents..."
          className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] px-3.5 py-1.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 outline-none shadow-sm"
        />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-zinc-400 uppercase text-[10px] bg-slate-50 dark:bg-white/[0.01]">
              <th className="py-3 px-4">Flat #</th>
              <th className="py-3 px-4">Resident</th>
              <th className="py-3 px-4">Phone / WhatsApp</th>
              <th className="py-3 px-4 text-center">Overdue</th>
              <th className="py-3 px-4 text-right">Total Due</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={6} className="py-4 px-4"><div className="h-5 bg-slate-100 dark:bg-white/[0.03] rounded" /></td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-400 dark:text-zinc-400">No overdue residents</td>
              </tr>
            ) : (
              filtered.map((e, idx) => {
                const st = whatsappStatus[e.occupant_id];
                return (
                  <tr key={`${e.occupant_id}-${idx}`} className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 px-4 font-mono font-semibold text-slate-900 dark:text-white">{e.unit_no}</td>
                    <td className="py-3.5 px-4 font-medium text-slate-900 dark:text-zinc-100">{e.name}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-zinc-300">{e.contact || "No phone"}</td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 px-2 py-0.5 text-[10px] font-mono">
                        {e.months_overdue} mo
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-semibold text-rose-600 dark:text-rose-300 tabular-nums">
                      {fmt(e.total_due)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {e.contact ? (
                        <button
                          type="button"
                          disabled={st === "sending"}
                          onClick={() => sendWhatsApp(e)}
                          className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] hover:bg-emerald-50 dark:hover:bg-emerald-500/20 hover:border-emerald-200 dark:hover:border-emerald-500/30 text-slate-700 dark:text-zinc-200 hover:text-emerald-700 dark:hover:text-emerald-300 px-3 py-1.5 text-xs font-medium transition-colors press-feedback disabled:opacity-50 shadow-sm"
                        >
                          {st === "sending" ? "Sending..." : st === "sent" ? "Sent ✓" : "Send WhatsApp"}
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400 dark:text-zinc-500">No contact</span>
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
  );
}
