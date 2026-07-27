"use client";

/**
 * This page was a dead stub — it called /api/admin/vendor-products/approve,
 * an endpoint that never existed, with a hardcoded userId: "ADMIN" that
 * bypassed real authentication entirely (a serious gap: it would have let
 * anyone who found this route approve products with no real session check,
 * had the backend route existed). The actually-working approvals queue is
 * /admin/vendor-products/pending, wired to the real, now super-admin-only
 * /api/vendor-products/[id]/approve. Redirect here so old links/bookmarks
 * still land somewhere real.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminVendorProductsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/vendor-products/pending");
  }, [router]);
  return null;
}
