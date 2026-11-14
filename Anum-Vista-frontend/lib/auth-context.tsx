"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { api, AuthUser } from "@/lib/api";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  role: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null, token: null, role: null, isAuthenticated: false, isLoading: true,
  login: async () => {}, logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const logout = useCallback(() => {
    localStorage.removeItem("av_token");
    localStorage.removeItem("av_role");
    setToken(null);
    setUser(null);
    router.push("/login");
  }, [router]);

  const fetchMe = useCallback(async (t: string) => {
    try {
      localStorage.setItem("av_token", t);
      const data = await api.getMe();
      setUser(data as AuthUser);
    } catch { logout(); }
  }, [logout]);

  useEffect(() => {
    const stored = localStorage.getItem("av_token");
    if (stored) {
      setToken(stored);
      fetchMe(stored).finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [fetchMe]);

  // Redirect to login if not authenticated (except on login page)
  useEffect(() => {
    if (!isLoading && !token && pathname !== "/login") {
      router.push("/login");
    }
  }, [isLoading, token, pathname, router]);

  const login = async (username: string, password: string) => {
    const data = await api.login(username, password);
    localStorage.setItem("av_token", data.access_token);
    localStorage.setItem("av_role", data.role);
    setToken(data.access_token);
    await fetchMe(data.access_token);
    router.push(data.role === "super_admin" || data.role === "senior_admin" ? "/dashboard" : "/tenants");
  };

  return (
    <AuthContext.Provider value={{
      user, token, role: user?.role ?? null,
      isAuthenticated: !!token && !!user, isLoading, login, logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
