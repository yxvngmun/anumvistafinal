"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { api, RolePermissionsMap } from "@/lib/api";

const PERMISSION_METADATA: Array<{ key: string; label: string; description: string }> = [
  { key: "overview", label: "Overview", description: "Dashboard summary metrics, revenue cards, and cashflow charts" },
  { key: "analytics", label: "Analytics", description: "Monthly financial analytics and Summary Sheet Excel export" },
  { key: "treasury", label: "Treasury", description: "Cash-in-hand balances per treasurer and fund transfers" },
  { key: "extra_curriculars", label: "Extra Curriculars", description: "Community hall, advertisement, and scrap sale collections" },
  { key: "audit_trail", label: "Audit Trail", description: "System-wide activity and approval audit logs" },
  { key: "reports_ledger", label: "Reports & Ledger", description: "Pending dues, advance payments, expenses breakdown, cash reconciliation, and resident ledger" },
  { key: "residents", label: "Residents", description: "Apartments, occupant directory, status, and contact details" },
  { key: "cars_parking", label: "Cars and parking", description: "Vehicle counts and extra car parking charges" },
  { key: "transactions", label: "Transactions", description: "Inflow collections, outflow expenses, and transaction logs" },
];

type EditableRole = "senior_admin" | "admin";

export default function RoleManagementPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<RolePermissionsMap | null>(null);
  const [savingRole, setSavingRole] = useState<EditableRole | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const isSuperAdmin = user?.role === "super_admin";

  useEffect(() => {
    if (!authLoading && !isSuperAdmin) {
      router.replace("/tenants");
    }
  }, [authLoading, isSuperAdmin, router]);

  const { data, isLoading } = useQuery({
    queryKey: ["role-permissions"],
    queryFn: api.getRolePermissions,
    enabled: isSuperAdmin,
  });

  useEffect(() => {
    if (data) {
      setDraft({
        senior_admin: { ...data.senior_admin },
        admin: { ...data.admin },
      });
    }
  }, [data]);

  const handleToggle = (role: EditableRole, key: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [role]: {
          ...prev[role],
          [key]: !prev[role][key],
        },
      };
    });
    setStatusMessage(null);
  };

  const handleSave = async (role: EditableRole) => {
    if (!draft) return;
    setSavingRole(role);
    setStatusMessage(null);
    try {
      const res = await api.updateRolePermissions(role, draft[role]);
      setDraft((prev) => (prev ? { ...prev, [role]: { ...res.permissions } } : prev));
      await queryClient.invalidateQueries({ queryKey: ["role-permissions"] });
      const label = role === "senior_admin" ? "Senior Admin" : "Admin";
      setStatusMessage({ type: "success", text: `Permissions updated for ${label} (200 OK). Changes apply on their next page load or refresh.` });
    } catch (err) {
      setStatusMessage({ type: "error", text: (err as Error).message || "Failed to update role permissions" });
    } finally {
      setSavingRole(null);
    }
  };

  if (authLoading || !isSuperAdmin) return null;

  const roles: Array<{ key: EditableRole; title: string; subtitle: string }> = [
    { key: "senior_admin", title: "Senior Admin", subtitle: "Management role (e.g. Dilshad)" },
    { key: "admin", title: "Admin", subtitle: "Operations role (e.g. Front Desk Admin)" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">
          Role Management
        </h2>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
          Manage section and endpoint permissions for Senior Admin and Admin roles
        </p>
      </div>

      {statusMessage && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-medium ${
            statusMessage.type === "success"
              ? "border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-rose-200 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300"
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {isLoading || !draft ? (
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-8 text-center text-xs text-slate-500 dark:text-zinc-400">
          Loading role permissions...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {roles.map((r) => (
            <div
              key={r.key}
              className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-5 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-white/10">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">{r.title}</h3>
                    <p className="text-xs text-slate-500 dark:text-zinc-400">{r.subtitle}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSave(r.key)}
                    disabled={savingRole === r.key}
                    className="rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-3.5 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity press-feedback"
                  >
                    {savingRole === r.key ? "Saving..." : "Save Permissions"}
                  </button>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-white/5 mt-2">
                  {PERMISSION_METADATA.map((perm) => {
                    const enabled = Boolean(draft[r.key][perm.key]);
                    return (
                      <label
                        key={perm.key}
                        className="flex items-center justify-between gap-4 py-3 cursor-pointer select-none"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-white">{perm.label}</p>
                          <p className="text-xs text-slate-500 dark:text-zinc-400">{perm.description}</p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={enabled}
                          onClick={() => handleToggle(r.key, perm.key)}
                          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                            enabled ? "bg-emerald-600" : "bg-slate-300 dark:bg-white/15"
                          }`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                              enabled ? "translate-x-4.5" : "translate-x-1"
                            }`}
                          />
                        </button>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

