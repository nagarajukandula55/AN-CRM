import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

/**
 * Solutions are always linked to Fault Codes (see moduleHierarchy.ts's
 * comment on why these two live as separate-but-paired modules) and every
 * vendor role that ever gets granted one grants both together (see
 * vendorAccess.service.ts's ROLE_MODULES). In practice a vendor's stored
 * Role.permissions can fall behind when "solutions" was added to
 * VENDOR_MODULE_KEYS after that role was last generated -- reproduced live
 * as a 403 on both GET and POST for an account that could already use the
 * BOM/fault-code pickers fine. Accepting "fault_codes" as an equivalent
 * grant here is the same pragmatic fallback used by
 * service-center-bom/route.ts, not a real relaxation of access -- a vendor
 * who can manage fault codes already manages solutions in the same
 * workflow (the workorder Solution dropdown).
 */
export function requireSolutionsPermission(session: any, action: "view" | "create" | "edit" | "delete") {
  try {
    requirePermission(session, buildPermissionCode("solutions", action));
  } catch (err: any) {
    requirePermission(session, buildPermissionCode("fault_codes", action));
  }
}
