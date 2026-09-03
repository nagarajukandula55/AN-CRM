import { resolveVendorContext } from "./vendorContext";
import BusinessMember from "@/models/BusinessMember";
import VendorProfile from "@/models/VendorProfile";
import { Types } from "mongoose";
import { headers } from "next/headers";

/**
 * SECURITY: closes a cross-tenant data leak in every route that scoped a
 * list query by `x-active-business-id (header) || ?businessId= (query
 * param)` with NO check that the requesting user is actually authorized
 * for that business. The header is server-set from the session JWT and
 * safe -- but whenever a session's JWT doesn't carry activeBusinessId
 * (a stale token issued before a fresh login, exactly the class of bug
 * fixed elsewhere this session in auth/me's self-heal), the header is
 * never set at all, and the route fell through to trusting a raw
 * `?businessId=` query param straight from the client with zero
 * ownership verification -- any authenticated vendor user could see
 * another vendor's records just by passing that vendor's businessId.
 *
 * Returns the businessId a route should actually filter by:
 * - Super admins/platform staff: the requested id, unchanged (existing
 *   cross-business oversight behavior, unaffected).
 * - Everyone else: their OWN business, resolved live from the DB via
 *   resolveVendorContext (covers vendor Owners, who have no
 *   BusinessMember row and so no reliable session.business either) --
 *   the requested id is only honored if it matches; any mismatch is
 *   silently corrected to the caller's real business rather than
 *   trusted, so a forged/stale businessId can never leak another
 *   tenant's data.
 *
 * `sessionBusinessId` should be the caller's already-resolved
 * IEnrichedSession.business?.businessId (BusinessMember-verified, covers
 * plain business staff) -- checked first since it's already paid for by
 * getEnrichedSession() on nearly every request; resolveVendorContext
 * (an extra DB round trip) only runs as a fallback for vendor Owners,
 * who have no BusinessMember row at all.
 *
 * Returns null if the user has no resolvable business at all (nothing to
 * scope to) -- callers should treat that as "return no results," not
 * "return everything."
 */
export async function resolveAuthorizedBusinessId(
  userId: string | null | undefined,
  requestedBusinessId: string | null | undefined,
  isSuperAdmin: boolean,
  sessionBusinessId?: string | null,
  allowExpiredForRead?: boolean
): Promise<string | null> {
  if (isSuperAdmin) {
    return requestedBusinessId || null;
  }

  const ctx = await resolveVendorContext(userId, { allowExpiredForRead });
  const ownBusinessId = ctx?.vendor?.businessId ? String(ctx.vendor.businessId) : null;

  // A legitimately multi-business staff member switching which business
  // they're viewing (not the currently-active one) is a real, supported
  // case -- verified here via an actual BusinessMember row, not just
  // trusted because the client asked for it.
  if (
    requestedBusinessId &&
    userId &&
    Types.ObjectId.isValid(requestedBusinessId) &&
    requestedBusinessId !== sessionBusinessId &&
    requestedBusinessId !== ownBusinessId
  ) {
    const verified = await BusinessMember.exists({
      userId,
      businessId: new Types.ObjectId(requestedBusinessId),
      isDeleted: false,
      status: "ACTIVE",
    });
    if (verified) return requestedBusinessId;
  }

  return sessionBusinessId || ownBusinessId || null;
}

/**
 * SECURITY: closes the vendor-level cross-tenant leak that
 * resolveAuthorizedBusinessId alone cannot -- most onboarded Service
 * Centers (VendorProfile docs, VND0001/VND0002/...) share ONE default
 * public Business (getDefaultPublicBusinessId), so scoping only by
 * businessId returns every vendor's data to every other vendor sharing
 * that Business. This wraps resolveAuthorizedBusinessId and additionally
 * resolves the caller's own vendorId (VendorProfile._id) from the same
 * resolveVendorContext lookup, so callers can filter by
 * {businessId, vendorId} instead of businessId alone.
 *
 * vendorId is null for: super admins (unless requestedVendorId is
 * explicitly passed), and business-level staff/owners with no
 * VendorProfile link -- both legitimately see/act on all vendors' data
 * under that business, same as before this change.
 */
export async function resolveAuthorizedVendorScope(
  userId: string | null | undefined,
  requestedBusinessId: string | null | undefined,
  isSuperAdmin: boolean,
  sessionBusinessId?: string | null,
  requestedVendorId?: string | null,
  allowExpiredForRead?: boolean
): Promise<{ businessId: string; vendorId: string | null } | null> {
  const businessId = await resolveAuthorizedBusinessId(
    userId,
    requestedBusinessId,
    isSuperAdmin,
    sessionBusinessId,
    allowExpiredForRead
  );
  if (!businessId) return null;

  if (isSuperAdmin) {
    return { businessId, vendorId: requestedVendorId || null };
  }

  const ctx = await resolveVendorContext(userId, { allowExpiredForRead });
  const ownVendorId = ctx?.vendor?._id ? String(ctx.vendor._id) : null;

  // A parent vendor Owner who switched into one of their own sub-vendors
  // (api/auth/switch-vendor) carries an x-active-vendor-id header set from
  // the JWT's activeVendorId claim (see middleware.ts) -- re-validated
  // here on every request (never just trusted from the claim/header) so a
  // stale or tampered header can never scope a request to a vendor that
  // isn't genuinely a sub-vendor of the caller.
  let vendorId = ownVendorId;
  if (ownVendorId) {
    const h = await headers();
    const activeVendorIdHeader = h.get("x-active-vendor-id");
    if (activeVendorIdHeader && activeVendorIdHeader !== ownVendorId) {
      const target = await VendorProfile.findOne({ _id: activeVendorIdHeader, isDeleted: { $ne: true } })
        .select("parentVendorId")
        .lean<any>();
      if (target && String(target.parentVendorId || "") === ownVendorId) {
        vendorId = activeVendorIdHeader;
      }
    }
  }

  return { businessId, vendorId };
}
