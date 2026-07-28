import React, { createContext, useContext, useEffect, useState } from "react";
import * as authApi from "@/api/auth";
import { getToken } from "@/api/client";

interface AuthContextValue {
  user: authApi.CrmUser | null;
  loading: boolean;
  signIn: (emailOrUsername: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<authApi.CrmUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const token = await getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    const sessionUser = await authApi.fetchSession();
    setUser(sessionUser);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function signIn(emailOrUsername: string, password: string) {
    const loggedInUser = await authApi.login(emailOrUsername, password);
    setUser(loggedInUser);
  }

  async function signOut() {
    await authApi.logout();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
