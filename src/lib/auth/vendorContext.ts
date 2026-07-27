import VendorProfile, { IVendorProfile } from "@/models/VendorProfile";
import BusinessMember from "@/models/BusinessMember";
import Business from "@/models/Business";

/**
 * Resolves which vendor a logged-in user should be scoped to when hitting
 * a /vendor/* or /api/vendor-products* endpoint — covering BOTH:
 *   1. The vendor OWNER (VendorProfile.userId === the caller) — the
 *      original, only-supported case until now.
 *   2. Vendor STAFF (a BusinessMember with vendorId set, added either by
 *      the vendor owner via /api/vendor/staff or by a super admin via
 *      /api/admin/vendor-staff) — this case was silently unsupported: every
 *      vendor-scoped route only ever checked VendorProfile.findOne({userId}),
 *      so a staff member could log in (their SSO token already carries
 *      vendorMemberships — see sso/token/route.ts) but every vendor
 *      endpoint (products, orders, warehouses, BOM, dashboard, statement,
 *      payout account) returned 403/empty for them. This helper is the
 *      single place that now recognizes both, so all those routes see
 *      staff correctly without duplicating the lookup logic per-file.
 *
 * Returns null if the caller is neither a vendor owner nor active staff of
 * any vendor — callers should treat that as "not a vendor" and fall back
 * to their existing business-scoped behavior (unchanged).
 */
export async function resolveVendorContext(
  userId: string | null | undefined
): Promise<{ vendor: IVendorProfile; role: "OWNER" | "STAFF"; vendorRole: string | null } | null> {
  if (!userId) return null;

  let result: { vendor: IVendorProfile; role: "OWNER" | "STAFF"; vendorRole: string | null } | null = null;

  const owned = await VendorProfile.findOne({ userId, isDeleted: { $ne: true } });
  if (owned) {
    result = { vendor: owned, role: "OWNER", vendorRole: null };
  } else {
    // Most-recently-joined wins when a user has staff memberships under more
    // than one vendor (e.g. stale test data left behind alongside a real,
    // later assignment) -- unsorted .findOne() returns whatever Mongo's
    // natural order happens to give, which can silently pick the wrong one.
    const membership = await BusinessMember.findOne({
      userId,
      vendorId: { $ne: null },
      isDeleted: { $ne: true },
      status: "ACTIVE",
    })
      .sort({ createdAt: -1 })
      .lean();
    if (membership?.vendorId) {
      const vendor = await VendorProfile.findOne({
        _id: membership.vendorId,
        isDeleted: { $ne: true },
      });
      if (vendor) {
        result = { vendor, role: "STAFF", vendorRole: (membership as any).vendorRole || null };
      }
    }
  }

  if (!result) return null;

  // marketplace.enableVendorPortal existed on Business but nothing ever
  // read it — any vendor could use the vendor portal regardless of this
  // toggle. Enforced here, the single shared resolver every /vendor/* and
  // /api/vendor-products* route already goes through, so it applies
  // everywhere at once rather than needing a per-route check. Treated the
  // same as "not a vendor" (null) — every existing caller already handles
  // that case with a clear 403/empty response.
  if (result.vendor.businessId) {
    const business = await Business.findById(result.vendor.businessId).select("marketplace").lean();
    if (business && (business as any).marketplace?.enableVendorPortal === false) {
      return null;
    }
  }

  return result;
}
