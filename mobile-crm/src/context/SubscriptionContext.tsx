import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getBillingInfo, daysRemaining, type BillingInfo } from "@/api/billing";
import { useAuth } from "./AuthContext";

interface SubscriptionContextValue {
  billing: BillingInfo | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(undefined);

/**
 * App-wide billing state, loaded once at the app shell and shared rather
 * than every screen independently re-fetching /api/vendor/billing.
 *
 * Backend has only one operating mode now (SC / vendor) -- the old
 * Brand/POS/mode-driven tab visibility this context used to power is gone;
 * every tab is now always visible (see app/(app)/_layout.tsx).
 */
export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setBilling(null); setLoading(false); return; }
    try {
      const info = await getBillingInfo();
      setBilling(info);
    } catch {
      setBilling(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  return <SubscriptionContext.Provider value={{ billing, loading, refresh }}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error("useSubscription must be used within SubscriptionProvider");
  return ctx;
}

export { daysRemaining };
