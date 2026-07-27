import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Role from "@/models/Role";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

function permissionErrorResponse(err: any) {
  return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
}

async function guard(action: "view" | "edit" | "delete") {
  const session = await getEnrichedSession();
  if (!session?.user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  try {
    requirePermission(session as any, buildPermissionCode("roles", action));
  } catch (err: any) {
    return { error: permissionErrorResponse(err) };
  }
  return { session };
}

// Roles are managed per business individually -- editing/deleting a role
// from Business B's context must never touch Business A's role, even
// though both were previously reachable through the same unscoped [id]
// endpoint (the actual "role created in another business" confusion this
// was fixed alongside: nothing stopped a stale _id from another business
// being edited here). businessId is optional on the request only for the
// handful of legacy platform-wide system roles (SUPER_ADMIN/AN_STAFF),
// which have no business owner to check against.
function assertBusinessOwnership(role: { businessId?: unknown }, requestBusinessId: string | null) {
  if (!role.businessId) return true; // platform-wide role -- no owner to check
  if (!requestBusinessId) return false;
  return String(role.businessId) === String(requestBusinessId);
}

// GET /api/admin/roles/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Was completely ungated -- any authenticated user (not just Super
  // Admin/roles.view holders) could read any role's full permission list.
  const { error } = await guard("view");
  if (error) return error;
  try {
    await connectDB();
    const { id } = await params;
    const role = await Role.findById(id);
    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }
    return NextResponse.json({ role });
  } catch (error) {
    console.error("Error fetching role:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/admin/roles/[id] - update permissions, and now also name/
// description/color/homeRoute/moduleOrder -- "edit" for a role previously
// meant only its permission grid; renaming or re-describing a role had no
// path at all once created.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Was completely ungated -- any authenticated user could edit any role's
  // permissions, not just Super Admin/roles.edit holders.
  const { error } = await guard("edit");
  if (error) return error;
  try {
    await connectDB();
    const { id } = await params;
    const body = await request.json();
    const { permissions, homeRoute, moduleOrder, name, description, color, businessId } = body;

    if (permissions !== undefined && !Array.isArray(permissions)) {
      return NextResponse.json({ error: "permissions must be an array" }, { status: 400 });
    }

    const existing = await Role.findById(id).select("businessId").lean();
    if (!existing) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }
    if (!assertBusinessOwnership(existing, businessId ?? null)) {
      return NextResponse.json({ error: "This role belongs to a different business" }, { status: 403 });
    }

    const update: Record<string, unknown> = {};
    if (permissions !== undefined) update.permissions = permissions;
    // Per-role post-login landing page and custom sidebar module ordering
    // -- both optional, both just stored as-is (validated by presence in
    // the picker's own options list on the client, same trust level as
    // `permissions` above).
    if (homeRoute !== undefined) update.homeRoute = homeRoute;
    if (moduleOrder !== undefined && Array.isArray(moduleOrder)) update.moduleOrder = moduleOrder;
    if (typeof name === "string" && name.trim()) update.name = name.trim();
    if (typeof description === "string") update.description = description;
    if (typeof color === "string" && color.trim()) update.color = color.trim();

    const role = await Role.findByIdAndUpdate(
      id,
      update,
      { new: true }
    );
    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    logAction({
      action: "UPDATE",
      entity: "Role",
      entityId: id,
      after: update,
      req: request,
    });

    return NextResponse.json({ role });
  } catch (error) {
    console.error("Error updating role:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/admin/roles/[id] - delete non-system role
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Was only checking "is logged in", not roles.delete -- any authenticated
  // user could delete any non-system role.
  const { error } = await guard("delete");
  if (error) return error;
  try {
    await connectDB();
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const role = await Role.findById(id);

    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    if (!assertBusinessOwnership(role, searchParams.get("businessId"))) {
      return NextResponse.json({ error: "This role belongs to a different business" }, { status: 403 });
    }

    if (role.isSystem === true) {
      return NextResponse.json({ error: "Cannot delete system roles" }, { status: 403 });
    }

    await role.deleteOne();

    logAction({
      action: "DELETE",
      entity: "Role",
      entityId: id,
      req: request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting role:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
