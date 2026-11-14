"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, hasPermission } from "@/lib/api";
import type { Transaction } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";

const holderOrder = ["Naveed", "Asif", "Dilshad", "Ali", "Danish"] as const;

const formatPkr = (value: string | number): string =>
  `₨ ${Number(value).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;

export default function TreasuryPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const isManagement = hasPermission(user, "treasury");

  useEffect(() => {
    if (!authLoading && !isManagement) {
      router.push("/tenants");
    }
  }, [authLoading, isManagement, router]);

  const { data, isLoading } = useQuery({
    queryKey: ["treasury-current"],
    queryFn: api.getTreasuryCurrent,
  });

  const { data: approvedTxns = [] } = useQuery({
    queryKey: ["approved-transactions"],
    queryFn: () => api.getTransactions("approved"),
  });

  const holders =
    data?.holders?.slice().sort((a, b) => {
      const ai = holderOrder.indexOf(a.name as (typeof holderOrder)[number]);
      const bi = holderOrder.indexOf(b.name as (typeof holderOrder)[number]);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    }) ?? [];

  const totalHeld = holders.reduce((acc, h) => acc + Number(h.amount || 0), 0);

  const confirmedReceipts = approvedTxns.filter(
    (tx) => tx.type === "INFLOW" && tx.status === "approved" && !!tx.credited_to
  );

  const recentApproved = [...confirmedReceipts]
    .sort((a: Transaction, b: Transaction) => {
      const left = new Date(b.approved_at ?? b.date).getTime();
      const right = new Date(a.approved_at ?? a.date).getTime();
      return left - right;
    })
    .slice(0, 6);

  if (authLoading || !isManagement) return null;

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Treasury Balances</h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
            Active cash in hand and custody distribution across treasurers
          </p>
        </div>
        <div className="text-left sm:text-right">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Total Treasury Volume</span>
          <p className="text-2xl sm:text-3xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">{formatPkr(totalHeld)}</p>
        </div>
      </div>

      {/* Holder Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-32 rounded-2xl bg-slate-100 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.05] animate-pulse" />
            ))
          : holders.map((holder) => (
              <div
                key={holder.name}
                className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] hover:border-slate-300 dark:hover:border-white/20 p-5 shadow-sm transition-all"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">{holder.name}</span>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                </div>
                <p className="mt-3 text-xl font-bold font-mono text-slate-900 dark:text-white tabular-nums tracking-tight">
                  {formatPkr(holder.amount)}
                </p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 font-medium">Custodian Balance</p>
              </div>
            ))}
      </div>

      {/* Recent Approved Receipts Inflow */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] p-5 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">Recent Confirmed Collections</h3>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mb-4">Latest validated receipts credited to treasury holders</p>

        <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
          {recentApproved.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400 dark:text-zinc-400">No recent approved receipts</p>
          ) : (
            recentApproved.map((tx) => (
              <div key={tx.id} className="py-3.5 flex items-center justify-between text-sm">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">Receipt {tx.receipt_no || `#${tx.id}`}</p>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                    Credited to {tx.credited_to} · {new Date(tx.date).toLocaleDateString("en-GB")}
                  </p>
                </div>
                <p className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-base tabular-nums">
                  +{formatPkr(tx.amount)}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
