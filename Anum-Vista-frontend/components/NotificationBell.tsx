"use client";

import { useEffect, useState, useRef } from "react";
import { api, NotificationItem } from "@/lib/api";
import { useRouter } from "next/navigation";

export default function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const fetchCount = async () => {
    if (typeof window === "undefined" || !localStorage.getItem("av_token")) return;
    try {
      const { unread_count } = await api.getUnreadCount();
      setUnread(unread_count);
    } catch {}
  };

  const fetchItems = async () => {
    if (typeof window === "undefined" || !localStorage.getItem("av_token")) return;
    try {
      const data = await api.getNotifications();
      setItems(data);
    } catch {}
  };

  useEffect(() => {
    fetchCount();
    const interval = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        fetchCount();
      }
    }, 25000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (open) fetchItems();
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleClick = async (n: NotificationItem) => {
    if (!n.is_read) {
      await api.markNotificationRead(n.id);
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      setUnread((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    router.push("/transactions?focus=pending");
  };

  const markAllRead = async () => {
    await api.markAllNotificationsRead();
    setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
    setUnread(0);
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative rounded-lg p-1.5 text-slate-500 hover:text-black hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors press-feedback"
        title="Notifications"
        aria-label="Notifications"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unread > 0 && (
          <span className="absolute top-0 right-0 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white shadow-sm">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 bottom-full mb-2 z-50 w-80 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d131f] shadow-xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 px-4 py-2.5 bg-slate-50 dark:bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900 dark:text-white">Notifications</span>
              {unread > 0 && (
                <span className="rounded-full bg-slate-200 dark:bg-white/15 px-1.5 py-0.2 text-[10px] text-slate-800 dark:text-zinc-200 font-mono">
                  {unread}
                </span>
              )}
            </div>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-[11px] text-slate-500 hover:text-black dark:text-zinc-400 dark:hover:text-white transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-white/[0.05]">
            {items.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 dark:text-zinc-500">No notifications</div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleClick(n)}
                  className={`w-full px-4 py-3 text-left transition-colors flex items-start gap-2.5 ${
                    n.is_read
                      ? "opacity-60 hover:opacity-100 hover:bg-slate-50 dark:hover:bg-white/[0.03]"
                      : "bg-slate-50/80 hover:bg-slate-100 dark:bg-white/[0.04] dark:hover:bg-white/[0.07]"
                  }`}
                >
                  {!n.is_read && (
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600 dark:bg-sky-400 ring-2 ring-blue-600/20" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-1">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{n.title}</p>
                      <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
                        {formatTime(n.created_at)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-zinc-300 mt-0.5 line-clamp-2">{n.message}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
