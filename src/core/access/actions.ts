/**
 * Standard action taxonomy for module-level access control.
 *
 * The point of this file: every module (system or admin-defined custom)
 * gets the SAME set of grantable actions, generated the same way, instead
 * of a developer hand-typing a new permission code per module per action
 * (which is how the original repo ended up with permission codes like
 * "erp.manage_inventory" that only existed for some modules and not others,
 * with no consistent pattern). This is what makes "map access to every
 * module" actually tractable — the action list is fixed and small, and
 * every module automatically gets a permission for each one.
 */

export const STANDARD_ACTIONS = [
  { key: "view", label: "View", description: "See records in this module" },
  { key: "create", label: "Create", description: "Add new records" },
  { key: "edit", label: "Edit", description: "Modify existing records" },
  { key: "delete", label: "Delete", description: "Remove records" },
  { key: "export", label: "Export", description: "Export records (CSV/PDF/etc.)" },
  { key: "approve", label: "Approve", description: "Approve or reject records that require sign-off" },
  { key: "manage_settings", label: "Manage Settings", description: "Change this module's own configuration" },
] as const;

export type StandardActionKey = (typeof STANDARD_ACTIONS)[number]["key"];

/**
 * Builds the permission code for a given module + action, e.g.
 * buildPermissionCode("inventory", "edit") -> "INVENTORY.EDIT"
 *
 * This is the ONE place this naming convention is defined. Every other
 * piece of code (permission seeding, access checks, UI matrix rendering)
 * calls this function rather than re-deriving the string format itself —
 * that's what stops the convention from drifting the way it did across the
 * 6 different invoice-numbering implementations in the original repo.
 */
export function buildPermissionCode(moduleKey: string, actionKey: string): string {
  return `${moduleKey.toUpperCase()}.${actionKey.toUpperCase()}`;
}

/**
 * Not every module needs every standard action (e.g. a read-only reporting
 * module might not need "create" or "delete"). Modules can declare which
 * subset of STANDARD_ACTIONS actually applies to them; if unspecified, all
 * standard actions apply. This keeps the access matrix from showing
 * meaningless checkboxes like "Delete" on a module that can never delete
 * anything.
 */
export function resolveActionsForModule(
  applicableActions: readonly string[] | undefined
): typeof STANDARD_ACTIONS[number][] {
  if (!applicableActions || applicableActions.length === 0) {
    return [...STANDARD_ACTIONS];
  }
  const allowed = new Set(applicableActions);
  return STANDARD_ACTIONS.filter((a) => allowed.has(a.key));
}
