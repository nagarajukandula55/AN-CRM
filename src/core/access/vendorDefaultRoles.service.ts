/**
 * REBUILT — the old version of this file generated a fixed set of 11
 * job-title roles per vendor (Finance Assistant, Warehouse Helper, Front
 * Office, Engineer, ...). Per the final access architecture, that whole
 * approach is withdrawn: a vendor now has exactly two structural roles
 * (Owner, Manager — see vendorAccess.service.ts's ensureVendorCoreRoles),
 * and every other staff member is granted per-module access directly by
 * the vendor's Owner/Manager from the vendor profile page's Team & Access
 * section (one access or many, their choice).
 *
 * This file keeps the old exported name because it's called from several
 * places (vendor finalize, /api/vendor/staff self-heal, the admin role
 * picker's on-demand generation) — they all now produce the new 2-role
 * set instead of the old 11.
 */
import { ensureVendorCoreRoles } from "./vendorAccess.service";

export async function createDefaultVendorRoles(
  vendorProfileId: string,
  businessId: string
): Promise<void> {
  await ensureVendorCoreRoles(vendorProfileId, businessId);
}
