/**
 * Floor-role lifecycle, per the final access architecture:
 *
 *  - Every self-registered user starts with exactly ONE access: the
 *    shopnative.in view floor (CUSTOMER_SHOPNATIVE — zero admin
 *    permissions; login routes floor-only accounts to shopnative.in).
 *  - The moment any REAL access is granted (AN staff role, a business
 *    role, vendor team module access, ...), the floor is REMOVED — the
 *    user retains only what was explicitly added, and the DB reflects it
 *    immediately so the next login lands them in the right UI instead of
 *    the storefront ("once we give any other access... that [floor]
 *    access should get removed and must retain only added").
 */
import Role from "@/models/Role";
import UserRole from "@/models/UserRole";

export const FLOOR_ROLE_CODES = ["CUSTOMER", "CUSTOMER_ANGROUP", "CUSTOMER_SHOPNATIVE"];

/** Remove every floor-role grant from a user — call right after granting
 * any real access. Safe to call repeatedly / when no floor grant exists. */
export async function stripFloorRoles(userId: string): Promise<void> {
  const floorRoles = await Role.find({ code: { $in: FLOOR_ROLE_CODES } })
    .select("_id")
    .lean();
  if (floorRoles.length === 0) return;
  await UserRole.deleteMany({
    userId,
    roleId: { $in: floorRoles.map((r: any) => r._id) },
  });
}
