"use client";

import { useEffect, useState } from "react";
import { api, AuditLogItem } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";

const actionStyles: Record<string, string> = {
  created: "bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-500/20",
  approved: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20",
  rejected: "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/20",
  cancelled: "bg-slate-100 dark:bg-zinc-500/10 text-slate-700 dark:text-zinc-400 border-slate-200 dark:border-zinc-500/20",
  restored: "bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-500/20",
  verified: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20",
  login: "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20",
};

interface ParsedAuditDetails {
  unit_no?: string;
  resident_name?: string;
  source_name?: string;
  amount?: string;
  received_by?: string;
  credited_to?: string;
  months?: string;
  period_label?: string;
  receipt_no?: string;
  restored_by?: string;
  restored_at?: string;
  reason?: string;
  date?: string;
  received_at?: string;
  remaining_overdue?: string;
}

const parseAuditDetails = (raw: string | null): ParsedAuditDetails | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
};

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function AuditLogPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState<string>("ALL");
  const [actorFilter, setActorFilter] = useState("");

  useEffect(() => {
    if (!authLoading && user?.role !== "super_admin") {
      router.push("/tenants");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    setLoading(true);
    api
      .getAuditLogs({
        limit: 200,
        offset: 0,
        action: actionFilter === "ALL" ? undefined : actionFilter,
        actor: actorFilter.trim() || undefined,
      })
      .then(setLogs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [actionFilter, actorFilter]);

  if (authLoading || user?.role !== "super_admin") return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">System Audit Trail</h2>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
          Immutable log of operational events, authentication, and financial approvals
        </p>
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] shadow-sm">
        <input
          type="text"
          placeholder="Filter by actor / username..."
          value={actorFilter}
          onChange={(e) => setActorFilter(e.target.value)}
          className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] px-3.5 py-1.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 outline-none w-full sm:w-64"
        />

        <div className="flex items-center gap-1 overflow-x-auto">
          {["ALL", "created", "approved", "restored", "rejected", "cancelled", "login"].map((f) => (
            <button
              key={f}
              onClick={() => setActionFilter(f)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors shrink-0 ${
                actionFilter === f
                  ? "bg-black dark:bg-white text-white dark:text-zinc-950 font-semibold shadow-sm"
                  : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {f === "ALL" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Log list */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] overflow-hidden shadow-sm">
        <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 p-4 animate-pulse"><div className="h-4 bg-slate-100 dark:bg-white/[0.03] rounded" /></div>
            ))
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 dark:text-zinc-400">No audit entries found</div>
          ) : (
            logs.map((item) => {
              const d = parseAuditDetails(item.details);
              const subject = d?.resident_name || d?.source_name;
              const tags: string[] = [];
              if (d?.unit_no) tags.push(`Flat ${d.unit_no}`);
              if (subject) tags.push(subject);
              if (d?.amount) tags.push(`Collected: ₨ ${Number(d.amount).toLocaleString("en-PK")}`);
              if (d?.remaining_overdue && Number(d.remaining_overdue) > 0) {
                tags.push(`Remaining Overdue: ₨ ${Number(d.remaining_overdue).toLocaleString("en-PK")}`);
              }
              if (d?.months) tags.push(`Months: ${d.months}`);
              if (d?.period_label) tags.push(`Period: ${d.period_label}`);
              if (d?.received_by) tags.push(`Received by: ${d.received_by}`);
              if (d?.credited_to) tags.push(`Treasurer: ${d.credited_to}`);
              if (d?.receipt_no) tags.push(`Ref: ${d.receipt_no}`);
              if (d?.restored_by) tags.push(`Restored by: ${d.restored_by}`);
              if (d?.reason) tags.push(`Reason: ${d.reason}`);

              return (
                <div key={item.id} className="p-4 flex items-start justify-between hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors text-xs gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider border shrink-0 mt-0.5 ${
                        actionStyles[item.action] || "bg-slate-100 dark:bg-zinc-500/10 text-slate-700 dark:text-zinc-400 border-slate-200 dark:border-zinc-500/20"
                      }`}
                    >
                      {item.action}
                    </span>
                    <div className="min-w-0">
                      <p className="text-slate-800 dark:text-zinc-200 font-medium">
                        <span className="text-slate-900 dark:text-white font-semibold">{item.performed_by_username || "System"}</span> · {item.entity_type} {item.entity_id ? `#${item.entity_id}` : ""}
                      </p>
                      {tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {tags.map((tag, i) => (
                            <span
                              key={i}
                              className="rounded-md bg-slate-100 dark:bg-white/[0.06] px-2 py-0.5 text-[11px] text-slate-700 dark:text-zinc-300 font-medium"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : item.details ? (
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono truncate mt-0.5">{item.details}</p>
                      ) : null}
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-400 dark:text-zinc-400 font-mono shrink-0 ml-4 tabular-nums">
                    {fmtTime(item.created_at)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
