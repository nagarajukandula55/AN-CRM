import { headers } from "next/headers";
import User from "@/models/User";
import BusinessMember from "@/models/BusinessMember";
import { Types } from "mongoose";

/**
 * =========================================================
 * BUSINESS CONTEXT (MULTI-TENANT CORE)
 * =========================================================
 * Reads user identity from JWT middleware headers, then resolves
 * the active business membership from MongoDB.
 *
 * The custom JWT middleware (src/middleware.ts) injects:
 *   x-user-id, x-user-email, x-user-name, x-user-role, x-is-super-admin
 * =========================================================
 */

export interface IBusinessContext {
  userId: string;
  businessId: string;
  organizationId: string;
  membershipId: string;
}

/**
 * The actual membership-resolution logic, split out so a caller that has
 * ALREADY loaded the User document (getEnrichedSession, which needs it for
 * its own role/permission lookup anyway) can reuse it instead of triggering
 * a second, redundant User.findOne -- getEnrichedSession runs on nearly
 * every authenticated request, so that duplicate query was pure overhead
 * multiplied across the whole app. getBusinessContext() below is now a
 * thin wrapper over this for every other existing caller.
 */
export async function resolveMembershipForUser(
  userId: Types.ObjectId | string,
  activeBusinessIdHeader: string | null
): Promise<IBusinessContext | null> {
  let membership = null as Awaited<ReturnType<typeof BusinessMember.findOne>> | null;

  if (activeBusinessIdHeader) {
    membership = await BusinessMember.findOne({
      userId,
      businessId: new Types.ObjectId(activeBusinessIdHeader),
      isDeleted: false,
      status: "ACTIVE",
    }).lean();
  }

  // Fall back to whichever membership is flagged default — covers the case
  // where no active-business header was sent (e.g. stale JWT) or it didn't
  // match a valid membership.
  if (!membership) {
    membership = await BusinessMember.findOne({
      userId,
      isDeleted: false,
      status: "ACTIVE",
      isDefaultBusiness: true,
    }).lean();
  }

  if (!membership) return null;

  // BusinessMember has no `organizationId` field at all (see models/
  // BusinessMember.ts) -- this used to call .toString() on `undefined`
  // unconditionally, throwing on every single call. getEnrichedSession()
  // wraps its call to getBusinessContext() in a try/catch that treats any
  // thrown error the same as "no business context at all," so this crash
  // silently short-circuited EVERY non-super-admin request straight to a
  // permission-less session, before role/permission resolution ever ran.
  // Organization is a real, standalone model but nothing in the active
  // Business/BusinessMember flow references it yet -- default safely
  // rather than crash until that's actually wired up.
  return {
    userId: userId.toString(),
    businessId: (membership as any).businessId.toString(),
    organizationId: (membership as any).organizationId?.toString() || "",
    membershipId: (membership as any)._id.toString(),
  };
}

/**
 * Get current active business context
 */
export async function getBusinessContext(): Promise<IBusinessContext | null> {
  const headersList = await headers();
  const userEmail = headersList.get("x-user-email");
  // The currently-selected business, as resolved by the JWT / business
  // switcher and injected by middleware. This is the SAME header that
  // /api/auth/me and every other business-scoped route (products,
  // vendors, integrations, etc.) treat as the source of truth — reading
  // it here too keeps finance in sync with whatever business the user
  // has actually switched to, instead of silently using a possibly-stale
  // "isDefaultBusiness" flag in the DB.
  const activeBusinessIdHeader = headersList.get("x-active-business-id");

  if (!userEmail) return null;

  const user = await User.findOne({ email: userEmail }).lean();

  if (!user) return null;

  return resolveMembershipForUser((user as any)._id, activeBusinessIdHeader);
}

/**
 * Get all businesses for current user
 */
export async function getUserBusinesses() {
  const headersList = await headers();
  const userEmail = headersList.get("x-user-email");

  if (!userEmail) return [];

  const user = await User.findOne({ email: userEmail }).lean();
  if (!user) return [];

  return BusinessMember.find({
    userId: (user as any)._id,
    isDeleted: false,
  }).populate("businessId");
}

/**
 * Switch active business for user
 */
export async function switchBusiness(
  userId: string,
  businessId: string
) {
  await BusinessMember.updateMany(
    { userId: new Types.ObjectId(userId) },
    { isDefaultBusiness: false }
  );

  await BusinessMember.updateOne(
    {
      userId: new Types.ObjectId(userId),
      businessId: new Types.ObjectId(businessId),
    },
    {
      isDefaultBusiness: true,
    }
  );

  return {
    success: true,
    activeBusinessId: businessId,
  };
}
