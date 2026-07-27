/**
 * DELETE /api/users/[id]/roles/[roleId] — remove a role from a user, backing
 * admin/users/[id]/page.tsx's removeRole(), which previously called this
 * with no matching backend at all.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import UserRole from "@/models/UserRole";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requireAnyPermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { logAction } from "@/lib/audit/logAction";

export async function DELETE(req: NextRequest, context: any) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      // Same widening as the POST route above -- a Manager with full
      // Employees access (but not the separate Users module) should still
      // be able to remove a role from their own employee.
      requireAnyPermission(session as any, [
        buildPermissionCode("users", "edit"),
        buildPermissionCode("employees", "edit"),
      ]);
    } catch (err: any) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    await connectDB();
    const { id: userId, roleId } = context?.params || {};

    const result = await UserRole.deleteOne({ userId, roleId });
    if (result.deletedCount === 0) {
      return NextResponse.json({ success: false, error: "Role assignment not found" }, { status: 404 });
    }

    logAction({
      action: "UPDATE",
      entity: "User",
      entityId: userId,
      after: { removedRoleId: roleId },
      req,
      actor: { id: session.user.id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
