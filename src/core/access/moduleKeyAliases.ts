/**
 * Sidebar nav items and permission checks (buildPermissionCode's first
 * argument) are supposed to share the same module-key namespace -- but a
 * handful of "masters-*" nav entries were given UI-only key names that
 * never matched the real module key their pages' API routes actually
 * check with requirePermission(). Business.modules[] is keyed off the
 * sidebar's nav key (see components/sidebar.tsx's STATIC_MODULES), so for
 * these entries, toggling the module ON in Business > Modules produced an
 * enabledKeys Set that never matched the real permission code's module
 * key -- a Vendor Owner's "*" (every enabled module) wildcard resolution
 * in vendorDefaultRoles.service.ts silently dropped these modules even
 * though they were visibly toggled on, and the module-enabled filter in
 * session-enriched.ts did the same for every other role. This is why
 * "Owner" looked like it granted a huge list of permissions but still
 * 403'd on a handful of real pages (Fault Codes, Solutions, Product
 * Categories among them).
 *
 * Renaming the sidebar keys outright would orphan every business's
 * already-saved Business.modules[] documents (they'd need a DB
 * migration this codebase has no safe way to run blind). Instead, both
 * call sites normalize through this alias map before matching, so an
 * existing business's saved toggle keeps working under its old key AND
 * the real permission module key it was always supposed to mean.
 */
export const MODULE_KEY_ALIASES: Record<string, string> = {
  "masters-prod-cat": "product_categories",
  // Renamed to sc-masters-* when these pages moved under console/sc/masters
  // (SC-exclusive now) -- both the old and new sidebar key alias to the
  // same real permission module key so existing saved Business.modules[]
  // toggles under the old key keep working.
  "sc-masters-fault-codes": "fault_codes",
  "masters-fault-codes": "fault_codes",
  "sc-masters-symptom-codes": "symptom_codes",
  "masters-symptom-codes": "symptom_codes",
  "sc-masters-solutions": "solutions",
  "masters-solutions": "solutions",
  "masters-mat-cat": "material_categories",
  "sc-masters-brands": "brands",
  "masters-brands": "brands",
  "masters-models": "device_models",
  "masters-units": "units",
  "sc-masters-crm-options": "crm_options",
  "masters-crm-options": "crm_options",
  // Second batch, found the same way (comparing every sidebar leaf key
  // against every real buildPermissionCode(...) call site) after a
  // reported "Settings and Integrations were enabled for a business but
  // never showed up when granting a role" -- these "admin-*" nav keys
  // never matched their pages' real enforced module key either.
  "admin-intg": "integrations",
  "admin-settings": "settings",
  "admin-users": "users",
  "admin-roles": "roles",
  // "admin-access" (Access Control) has no permission code of its own --
  // its actual page/API (admin/access, api/admin/access-layout) is
  // enforced under "roles" (requirePermission(session, "ROLES.EDIT")),
  // not a separate "access" key, so it aliases straight to that.
  "admin-access": "roles",
  // invoice-templates/route.ts enforces "settings", not its own key.
  "admin-invoice-templates": "settings",
  "admin-gst": "gst",
  // Third batch, found by checking each masters/HR page's ACTUAL
  // requirePermission(buildPermissionCode(...)) call against its sidebar
  // key and its (separately seeded, often-mismatched) ModuleDefinition row:
  //
  // api/hr/leaves/route.ts enforces "hr_leaves" (plural) -- neither the
  // sidebar's "hr-leave" nor the ModuleDefinition row's own "hr_leave"
  // (singular) key matched it.
  "hr-leave": "hr_leaves",
  // api/hr/payroll/route.ts enforces "hr_payroll" -- matches the
  // ModuleDefinition row already, just not the sidebar's "hr-payroll".
  "hr-payroll": "hr_payroll",
  // api/purchase-orders/route.ts enforces "purchase" (the SAME permission
  // as the main Purchase page), not a separate "purchase_orders" code --
  // the ModuleDefinition row seeded under that key has never actually been
  // checked by anything.
  "purchase-orders": "purchase",
  // api/contact/route.ts's GET / api/contact/[id]/route.ts's PATCH enforce
  // "contact_messages" (underscore, per moduleHierarchy.ts) -- the sidebar
  // nav key is kebab-case "contact-messages" like every other nav leaf.
  "contact-messages": "contact_messages",
  // Fourth batch, found while auditing why a plain business admin (not
  // super admin) couldn't see Sales/Stock Adjustments/Stock Transfers in
  // the sidebar at all despite being granted the equivalent module: same
  // kebab-case-sidebar-key vs underscore-permission-code split as every
  // other entry above. api/stock/adjustments/route.ts and
  // api/stock/transfers/route.ts enforce the underscored codes.
  "stock-adjustments": "stock_adjustments",
  "stock-transfers": "stock_transfers",
  // Found live: a Service Center Owner hit "Forbidden: Missing permission
  // -> CATALOG.CREATE" using the Workorders "Request to add a Brand" mini-
  // modal -- api/catalog/requests/route.ts enforces the bare "catalog"
  // module key (see moduleHierarchy.ts's comment on that entry), not the
  // sidebar's "masters-catalog-requests" key, so toggling that module on
  // for a business never actually granted it. Same bug class as every
  // other entry in this file.
  "masters-catalog-requests": "catalog",
  // Sidebar/Business.modules key is "material-catalog" (the canonical
  // Material/BOM list page, models/BOM.ts) but moduleHierarchy.ts's real
  // ModuleDefinition -- and every VENDOR_MODULE_KEYS grant -- is seeded
  // under "bom". Without this alias a vendor Owner/Manager's granted
  // BOM.VIEW permission never matched "material-catalog"'s own unaliased
  // key, so the nav item never appeared for any vendor business
  // regardless of Business.modules toggles. Same bug class as every
  // other entry in this file.
  "material-catalog": "bom",
  // Both nav keys are backed by the same "reports" permission --
  // api/reports/definitions/route.ts and api/analytics/overview/route.ts
  // (see moduleHierarchy.ts's "reports" entry comment).
  "report-builder": "reports",
};

/**
 * Given a business's enabled module keys (as stored, e.g. from
 * Business.modules[]), return the set expanded to include every real
 * permission-module-key alias too -- so matching a permission code's
 * module key against this set succeeds regardless of which of the two
 * names the caller used.
 */
export function expandWithAliases(keys: Iterable<string>): Set<string> {
  const expanded = new Set<string>();
  for (const key of keys) {
    expanded.add(key);
    const alias = MODULE_KEY_ALIASES[key];
    if (alias) expanded.add(alias);
    // Reverse lookup too, in case something was saved under the real key
    // directly rather than the sidebar's UI key.
    for (const [uiKey, realKey] of Object.entries(MODULE_KEY_ALIASES)) {
      if (realKey === key) expanded.add(uiKey);
    }
  }
  return expanded;
}
