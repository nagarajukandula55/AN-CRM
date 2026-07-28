import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getSubscriptionStatus, type SubscriptionStatus } from "@/api/subscriptions";
import { useAuth } from "./AuthContext";

interface SubscriptionContextValue {
  sub: SubscriptionStatus | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(undefined);

/**
 * App-wide subscription state -- what drives which tabs/menu items appear
 * (per explicit direction: "based on subscription the options and menu
 * should appear"). Loaded once at the app shell and shared, rather than
 * every screen independently re-fetching /api/subscriptions/status.
 */
export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [sub, setSub] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setSub(null); setLoading(false); return; }
    try {
      const status = await getSubscriptionStatus();
      setSub(status);
    } catch {
      setSub(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  return <SubscriptionContext.Provider value={{ sub, loading, refresh }}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error("useSubscription must be used within SubscriptionProvider");
  return ctx;
}
