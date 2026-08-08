import { resolveVendorContext } from "./vendorContext";
import BusinessMember from "@/models/BusinessMember";
import { Types } from "mongoose";

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
  sessionBusinessId?: string | null
): Promise<string | null> {
  if (isSuperAdmin) {
    return requestedBusinessId || null;
  }

  const ctx = await resolveVendorContext(userId);
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
