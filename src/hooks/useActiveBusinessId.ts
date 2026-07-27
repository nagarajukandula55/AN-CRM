"use client";

import { useEffect, useState } from "react";
import { getAuthMe } from "@/lib/authMeCache";

/**
 * The canonical way to get the current admin's active business id on the
 * client. Was `localStorage.getItem("businessId")` on 15+ admin pages
 * (Brands, Product Categories, Material Categories, Units, Fault Codes,
 * Employees, Finance, Inventory, Sales Invoices, Agreements, Production,
 * Stock Adjustments, Stock Transfers, Inventory Lots) -- but nothing in
 * the real login/business-switching flow (sidebar.tsx's business
 * switcher, /api/auth/switch-business) ever writes that key. It's only
 * ever set by a separate, mostly-unused businessSwitcher.tsx component.
 * For any admin who never happened to touch that specific component,
 * localStorage.getItem("businessId") returned null forever, silently
 * breaking every create/edit action on all those pages with errors like
 * "name and businessId are required" even though the form was filled in
 * correctly -- there was just no businessId to send.
 *
 * This reads the same source of truth the sidebar and every other working
 * page already uses: GET /api/auth/me's user.activeBusinessId (server
 * session, kept in sync by the real business switcher).
 */
export function useActiveBusinessId(): { businessId: string | null; businessName: string | null } {
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAuthMe()
      .then((d) => {
        if (cancelled) return;
        const id = d?.user?.activeBusinessId || d?.businesses?.[0]?._id || null;
        setBusinessId(id);
        setBusinessName(d?.businesses?.find((b: any) => b._id === id)?.name || null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return { businessId, businessName };
}
