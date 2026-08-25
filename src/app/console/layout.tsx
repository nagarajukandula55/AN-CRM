import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/mongodb";
import BusinessMember from "@/models/BusinessMember";
import AdminShell from "@/components/AdminShell";

/**
 * Hard server-side gate on the ENTIRE /console/* tree, keeping a pure
 * VENDOR identity out of it entirely -- before this file did any check
 * at all, nothing above the individual page level stopped a vendor
 * account from navigating straight to any /console/* URL (including
 * /console/admin/settings, the platform's own Business Profile editor --
 * reported live: a vendor reached it directly in production/incognito
 * and both saw and could Save the real platform Business record).
 * console/admin/layout.tsx adds an additional, stricter super-admin-only
 * gate on top of this for the admin subtree specifically; this layout is
 * the broader "vendors belong in /vendor, not here at all" boundary,
 * covering /console/sc/* and everything else too.
 *
 * Same detection vendor/layout.tsx already uses to decide "is this user
 * a vendor" (role === 'VENDOR' OR an ACTIVE BusinessMember row with a
 * vendorId set) -- mirrored here, inverted: a super admin or platform
 * staff member always passes through regardless; anyone who resolves as
 * vendor-only (no admin/staff flags) gets redirected to their own
 * portal instead of silently rendering the admin shell around them.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const isSuperAdmin = headersList.get("x-is-super-admin") === "true";
  const isPlatformStaff = headersList.get("x-is-platform-staff") === "true";
  const role = headersList.get("x-user-role");
  const userId = headersList.get("x-user-id");

  if (!isSuperAdmin && !isPlatformStaff) {
    let isVendorOnly = role === "VENDOR";
    if (!isVendorOnly && userId) {
      try {
        await connectDB();
        const membership = await BusinessMember.findOne({
          userId,
          vendorId: { $ne: null },
          status: "ACTIVE",
          isDeleted: { $ne: true },
        }).select("_id").lean();
        isVendorOnly = !!membership;
      } catch {
        // best-effort -- a lookup failure should never let a vendor
        // through by accident, but also shouldn't 500 the whole console
        // for a genuine admin on a transient DB hiccup, so fall through
        // to the existing per-page checks in that case rather than redirect.
      }
    }
    if (isVendorOnly) {
      redirect("/vendor");
    }
  }

  return <AdminShell>{children}</AdminShell>;
}
