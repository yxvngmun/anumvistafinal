"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect, useRef } from "react";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import NotificationBell from "@/components/NotificationBell";

function Sidebar({
  collapsed,
  setCollapsed,
}: {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}) {
  const { user, isAuthenticated, logout } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [expensesOpen, setExpensesOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pathname.startsWith("/transactions")) setExpensesOpen(true);
    if (
      pathname.startsWith("/reports") ||
      pathname.startsWith("/ledger") ||
      pathname.startsWith("/reminders")
    ) {
      setReportsOpen(true);
    }
  }, [pathname]);

  // Load and apply theme
  useEffect(() => {
    const savedTheme = localStorage.getItem("av_theme");
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    } else {
      document.documentElement.classList.remove("dark");
      setIsDark(false);
    }
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("av_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("av_theme", "light");
    }
  };

  // Close profile menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!isAuthenticated || pathname === "/login") return null;

  const isSuperAdmin = user?.role === "super_admin";
  const isSeniorAdmin = user?.role === "senior_admin";
  const isManagement = isSuperAdmin || isSeniorAdmin;

  const adminItems = [
    {
      href: "/tenants",
      label: "Residents",
      icon: (
        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      href: "/car-maintenance",
      label: "Cars and parking",
      icon: (
        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 11l1.5-4.5A2 2 0 018.4 5h7.2a2 2 0 011.9 1.5L19 11M5 11v6a1 1 0 001 1h1m12-7v6a1 1 0 01-1 1h-1M5 11h14M7.5 14.5a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z" />
        </svg>
      ),
    },
  ];

  const superAdminItems = [
    {
      href: "/dashboard",
      label: "Overview",
      icon: (
        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      ),
    },
    {
      href: "/analytics",
      label: "Analytics",
      icon: (
        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13l5-5 4 4 9-9m0 0h-6m6 0v6" />
        </svg>
      ),
    },
    {
      href: "/treasury",
      label: "Treasury",
      icon: (
        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      href: "/extra-curriculars",
      label: "Extra Curriculars",
      icon: (
        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
    },
    {
      href: "/audit-log",
      label: "Audit Trail",
      icon: (
        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
  ];

  const navItems = isManagement ? [...superAdminItems, ...adminItems] : adminItems;

  return (
    <aside
      className={`sticky top-0 h-screen shrink-0 bg-white dark:bg-[#0d131f] border-r border-slate-200 dark:border-white/10 text-slate-800 dark:text-zinc-200 flex flex-col justify-between select-none z-30 transition-[width] duration-150 ease-out ${
        collapsed ? "w-[72px]" : "w-64"
      }`}
    >
      <div>
        {/* Brand Header */}
        <div
          className={`py-3.5 border-b border-slate-200 dark:border-white/10 flex items-center transition-all ${
            collapsed ? "px-2 flex-col justify-center gap-2" : "px-4 justify-between"
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-black text-white dark:bg-white dark:text-black flex items-center justify-center text-xs font-bold shrink-0 shadow-sm">
              AV
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white uppercase truncate">
                  Anum Vista
                </h1>
                <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium truncate">
                  Finance Portal
                </p>
              </div>
            )}
          </div>

          {/* Collapse/Expand Toggle Button */}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className={`rounded-lg text-slate-400 hover:text-black hover:bg-slate-100 dark:hover:text-white dark:hover:bg-white/10 transition-colors shrink-0 ${
              collapsed ? "w-7 h-7 flex items-center justify-center" : "p-1.5"
            }`}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={collapsed ? "M9 5l7 7-7 7" : "M15 19l-7-7 7-7"} />
            </svg>
          </button>
        </div>

        {/* Navigation list */}
        <nav className="p-2.5 space-y-1.5 overflow-y-auto max-h-[calc(100vh-140px)]">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors press-feedback ${
                      active
                        ? "bg-black text-white dark:bg-white dark:text-black shadow-sm font-semibold"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/10"
                    } ${collapsed ? "justify-center px-0" : ""}`}
                  >
                    {item.icon}
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                </li>
              );
            })}

            {/* Transactions Group */}
            <li className="pt-2">
              <button
                type="button"
                onClick={() => setExpensesOpen(!expensesOpen)}
                title={collapsed ? "Transactions" : undefined}
                className={`w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors press-feedback ${
                  pathname.startsWith("/transactions")
                    ? "bg-slate-100 text-black dark:bg-white/10 dark:text-white font-semibold"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/10"
                } ${collapsed ? "justify-center px-0" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  {!collapsed && <span className="truncate">Transactions</span>}
                </div>
                {!collapsed && (
                  <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expensesOpen ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>
              {expensesOpen && !collapsed && (
                <ul className="mt-1 ml-4 pl-3 border-l border-slate-200 dark:border-white/10 space-y-1">
                  <li>
                    <Link
                      href="/transactions?tab=inflow"
                      className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                        searchParams.get("tab") === "inflow" ||
                        (pathname === "/transactions" && !searchParams.get("tab"))
                          ? "text-black dark:text-white font-bold bg-slate-100 dark:bg-white/10"
                          : "text-slate-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
                      }`}
                    >
                      Inflow (Collections)
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/transactions?tab=outflow"
                      className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                        searchParams.get("tab") === "outflow"
                          ? "text-black dark:text-white font-bold bg-slate-100 dark:bg-white/10"
                          : "text-slate-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
                      }`}
                    >
                      Outflow (Expenses)
                    </Link>
                  </li>
                </ul>
              )}
            </li>

            {/* Reports Group (Super Admin & Senior Admin) */}
            {isManagement && (
              <li className="pt-2">
                <button
                  type="button"
                  onClick={() => setReportsOpen(!reportsOpen)}
                  title={collapsed ? "Reports & Ledger" : undefined}
                  className={`w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors press-feedback ${
                    pathname.startsWith("/reports") ||
                    pathname.startsWith("/ledger") ||
                    pathname.startsWith("/reminders")
                      ? "bg-slate-100 text-black dark:bg-white/10 dark:text-white font-semibold"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/10"
                  } ${collapsed ? "justify-center px-0" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {!collapsed && <span className="truncate">Reports & Ledger</span>}
                  </div>
                  {!collapsed && (
                    <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${reportsOpen ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </button>
                {reportsOpen && !collapsed && (
                  <ul className="mt-1 ml-4 pl-3 border-l border-slate-200 dark:border-white/10 space-y-1">
                    {[
                      { href: "/reports/pending-dues", label: "Pending Dues" },
                      { href: "/reports/advance-payments", label: "Advance Payments" },
                      { href: "/reports/expenses", label: "Expenses Breakdown" },
                      { href: "/reports/cash-reconciliation", label: "Cash Reconciliation" },
                      { href: "/ledger", label: "Resident Ledger" },
                      /* { href: "/reminders", label: "Due Reminders" }, -- commented out for now */
                    ].map((sub) => (
                      <li key={sub.href}>
                        <Link
                          href={sub.href}
                          className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                            pathname === sub.href
                              ? "text-black dark:text-white font-bold bg-slate-100 dark:bg-white/10"
                              : "text-slate-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
                          }`}
                        >
                          {sub.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )}
          </ul>
        </nav>
      </div>

      {/* User Footer Panel with Dropdown */}
      <div ref={profileRef} className="relative p-2.5 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setProfileOpen(!profileOpen)}
            className={`flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-200/70 dark:hover:bg-white/10 transition-colors w-full ${
              collapsed ? "justify-center" : ""
            }`}
            title="Profile & Settings"
          >
            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-white/15 text-slate-900 dark:text-white font-bold text-sm flex items-center justify-center shrink-0">
              {user?.username?.charAt(0).toUpperCase() || "U"}
            </div>
            {!collapsed && (
              <div className="min-w-0 text-left flex-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {user?.username}
                </p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 capitalize">
                  {isSuperAdmin ? "Super Admin" : isSeniorAdmin ? "Senior Admin" : "Admin"}
                </p>
              </div>
            )}
            {!collapsed && (
              <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="1" />
                <circle cx="12" cy="5" r="1" />
                <circle cx="12" cy="19" r="1" />
              </svg>
            )}
          </button>

          {!collapsed && <NotificationBell />}
        </div>

        {/* Profile Dropdown Menu */}
        {profileOpen && (
          <div className="absolute left-2 bottom-full mb-2 z-50 w-60 rounded-xl border border-slate-200 dark:border-white/15 bg-white dark:bg-[#0d131f] shadow-xl p-2 space-y-1 text-sm">
            <div className="px-3.5 py-2.5 border-b border-slate-100 dark:border-white/10">
              <p className="font-semibold text-slate-900 dark:text-white truncate">{user?.username}</p>
              <p className="text-xs text-slate-500 dark:text-zinc-400 capitalize">{user?.role?.replace("_", " ")}</p>
            </div>

            {/* Dark Mode Sleek Toggle Switch */}
            <div
              role="switch"
              aria-checked={isDark}
              tabIndex={0}
              onClick={toggleTheme}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleTheme();
                }
              }}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer select-none"
            >
              <span className="font-medium text-slate-800 dark:text-zinc-200">Dark Mode</span>
              <div
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out ${
                  isDark ? "bg-black dark:bg-white" : "bg-slate-300 dark:bg-zinc-700"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white dark:bg-black transition-transform duration-200 ease-in-out shadow-sm ${
                    isDark ? "translate-x-4" : "translate-x-1"
                  }`}
                />
              </div>
            </div>

            {/* Sign Out */}
            <button
              type="button"
              onClick={logout}
              className="w-full flex items-center px-3.5 py-2.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors font-semibold"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";
  const [collapsed, setCollapsed] = useState(false);

  return (
    <AuthProvider>
      <div className="flex min-h-screen bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100">
        <Suspense fallback={null}>
          <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
        </Suspense>
        <main
          className={`min-h-screen flex-1 overflow-x-hidden ${
            isLoginPage ? "" : "p-4 sm:p-6 lg:p-8"
          }`}
        >
          <div className={isLoginPage ? "" : "max-w-7xl mx-auto space-y-6"}>
            <Suspense
              fallback={<div className="h-32 animate-pulse rounded-xl bg-slate-200 dark:bg-white/5" />}
            >
              {children}
            </Suspense>
          </div>
        </main>
      </div>
    </AuthProvider>
  );
}
