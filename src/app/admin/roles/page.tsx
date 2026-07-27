import { redirect } from "next/navigation";

// This page used to be a standalone role editor built against a hand-typed
// ALL_PERMISSIONS list ("erp.view_inventory", "crm.manage_leads", etc.)
// that never matched any real buildPermissionCode(...) module/action --
// toggling those checkboxes silently did nothing (see moduleHierarchy.ts's
// top comment, which documents this exact page as the "third, hand-typed
// list" problem). /admin/access is the real, working Roles & Permissions
// editor (built on ACCESS_HIERARCHY, the canonical enforced module list),
// so the sidebar's "Roles & Permissions" link now lands there instead of
// on this dead-end page.
export default function RolesPageRedirect() {
  redirect("/admin/access");
}
