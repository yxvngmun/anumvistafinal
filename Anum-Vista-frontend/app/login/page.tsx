"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.warmUpBackend();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = username.trim();
    if (!cleanUsername) {
      setError("Please enter your username");
      return;
    }
    if (!password) {
      setError("Please enter your password");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await login(cleanUsername, password);
      // Keep loading active while router navigates to avoid flash
    } catch (err) {
      setError((err as Error).message || "Invalid username or password");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 overflow-y-auto bg-black text-white flex flex-col items-center justify-center p-6 sm:p-10 select-none">
      {/* ─── Translucent Dark Ambient Animated Motion Background ─── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Subtle geometric dot grid pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:32px_32px] opacity-40" />

        {/* Floating luminous dark orbs */}
        <div className="absolute -top-24 -left-24 w-[520px] h-[520px] rounded-full bg-gradient-to-tr from-cyan-950/40 via-blue-950/30 to-transparent blur-[110px] animate-float-slow" />
        <div className="absolute -bottom-32 -right-24 w-[560px] h-[560px] rounded-full bg-gradient-to-bl from-indigo-950/40 via-purple-950/25 to-transparent blur-[120px] animate-float-reverse" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[420px] h-[420px] rounded-full bg-slate-900/40 blur-[90px] animate-pulse-subtle" />

        {/* Soft dark vignette */}
        <div className="absolute inset-0 bg-radial-gradient from-transparent via-black/40 to-black/90" />
      </div>

      {/* ─── Sleek Animated Loading Overlay with Logo & "Redirecting..." ─── */}
      {loading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-2xl animate-fadeIn">
          {/* Animated Logo Container with Radiant Halo */}
          <div className="relative flex items-center justify-center mb-6">
            {/* Outer ambient blur glow */}
            <div className="absolute -inset-8 rounded-full bg-white/10 blur-2xl animate-pulse" />

            {/* Glowing rotating orbital gradient ring */}
            <div className="absolute -inset-2.5 rounded-[26px] bg-gradient-to-tr from-white via-white/50 to-transparent animate-spin [animation-duration:2s] opacity-90" />

            {/* Core AV Logo */}
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white text-black font-extrabold text-2xl sm:text-3xl flex items-center justify-center shadow-2xl z-10 ring-1 ring-white/60">
              AV
            </div>
          </div>

          {/* Status Text Display */}
          <div className="text-center space-y-1.5 animate-fadeIn">
            <p className="text-xl sm:text-2xl font-bold tracking-widest text-white uppercase flex items-center justify-center gap-1 font-mono">
              <span>Redirecting</span>
              <span className="inline-flex tracking-normal">
                <span className="animate-pulse [animation-duration:1s]">.</span>
                <span className="animate-pulse [animation-duration:1s] [animation-delay:200ms]">.</span>
                <span className="animate-pulse [animation-duration:1s] [animation-delay:400ms]">.</span>
              </span>
            </p>
            <p className="text-xs sm:text-sm text-zinc-400 font-medium tracking-wider">
              Securing session & loading dashboard
            </p>
          </div>
        </div>
      )}

      {/* ─── External / Cardless Form Container ─── */}
      <div className="relative z-10 w-full max-w-md my-auto space-y-8">
        {/* Branding (Enlarged for High Visibility) */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white text-black font-extrabold text-xl sm:text-2xl shadow-2xl shadow-white/10 ring-1 ring-white/20">
            AV
          </div>
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              Anum Vista
            </h1>
            <p className="text-sm sm:text-base text-zinc-400 font-medium mt-1">
              Finance & Operations Portal
            </p>
          </div>
        </div>

        {/* Error notification banner */}
        {error && (
          <div className="rounded-2xl bg-rose-500/15 border border-rose-500/30 px-5 py-4 text-sm sm:text-base text-rose-300 font-semibold flex items-center justify-between animate-fadeIn">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-rose-400 hover:text-white ml-2 text-lg font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Direct Fields (No enclosed modal/card) */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Username Field */}
          <div className="space-y-2">
            <label className="block text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-300">
              Username
            </label>
            <div className="relative">
              <input
                type="text"
                required
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                className="w-full h-14 sm:h-16 px-5 rounded-2xl border border-white/20 bg-white/[0.06] hover:bg-white/[0.09] focus:bg-white/[0.12] text-white text-base sm:text-lg placeholder:text-zinc-500 outline-none focus:border-white focus:ring-2 focus:ring-white/20 transition-all backdrop-blur-md"
              />
            </div>
          </div>

          {/* Password Field with Show/Hide Toggle */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-300">
                Password
              </label>
            </div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full h-14 sm:h-16 pl-5 pr-14 rounded-2xl border border-white/20 bg-white/[0.06] hover:bg-white/[0.09] focus:bg-white/[0.12] text-white text-base sm:text-lg placeholder:text-zinc-500 outline-none focus:border-white focus:ring-2 focus:ring-white/20 transition-all backdrop-blur-md"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                title={showPassword ? "Hide password" : "Show password"}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Large Tactile Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-14 sm:h-16 rounded-2xl bg-white text-black hover:bg-zinc-200 active:scale-[0.99] text-base sm:text-lg font-extrabold tracking-wide transition-all shadow-xl shadow-white/10 disabled:opacity-50 press-feedback mt-2"
          >
            {loading ? "Signing in..." : "Continue"}
          </button>
        </form>

        {/* Footer Info (High-Contrast for Readability) */}
        <div className="pt-4 text-center space-y-2">
          <p className="text-xs sm:text-sm text-zinc-400 font-medium">
            Default super admin: <span className="text-white font-mono font-bold bg-white/10 px-2.5 py-1 rounded-lg">anumvista</span>
          </p>
          <p className="text-[11px] sm:text-xs text-zinc-500">
            Direct Authentication · Anum Vista Management System
          </p>
        </div>
      </div>
    </div>
  );
}
