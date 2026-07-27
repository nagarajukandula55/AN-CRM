import React, { createContext, useContext, useEffect, useState } from "react";
import { apiFetch, clearToken, getToken, setToken } from "../api/client";
import type { AppMode } from "../api/region";

interface AuthUser {
  id: string;
  name: string;
  email: string;
  roles: AppMode[]; // resolved from UserRole/UserBusinessAccess server-side
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  activeMode: AppMode | null;
  setActiveMode: (mode: AppMode) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeMode, setActiveMode] = useState<AppMode | null>(null);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const me = await apiFetch<AuthUser>("/api/auth/me");
        setUser(me);
        setActiveMode(me.roles[0] ?? null);
      } catch {
        await clearToken();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function login(email: string, password: string) {
    const { token, user: loggedInUser } = await apiFetch<{ token: string; user: AuthUser }>(
      "/api/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) }
    );
    await setToken(token);
    setUser(loggedInUser);
    setActiveMode(loggedInUser.roles[0] ?? null);
  }

  async function logout() {
    await clearToken();
    setUser(null);
    setActiveMode(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, activeMode, setActiveMode, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
