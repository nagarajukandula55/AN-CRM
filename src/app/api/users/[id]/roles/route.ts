import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import UserService from "@/services/user/user.service";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requireAnyPermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

/* =========================================================
 * ASSIGN ROLE TO USER
 * =======================================================*/
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // auth() confirms a real session but has no RBAC concept of its own --
    // was missing a permission gate entirely, so any authenticated user
    // (any role) could assign roles to any other user. Accepts either
    // users.edit OR employees.edit -- a business Manager granted full
    // access to the Employees module (but not the separate, broader Users
    // module) should still be able to assign a role to their own
    // employees; requiring users.edit alone locked this out for exactly
    // that common case.
    const enrichedSession = await getEnrichedSession();
    try {
      requireAnyPermission(enrichedSession as any, [
        buildPermissionCode("users", "edit"),
        buildPermissionCode("employees", "edit"),
      ]);
    } catch (err: any) {
      return NextResponse.json(
        { error: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    const { id: userId } = await context.params;
    const body = await req.json();

    // businessId is optional -- UserRole's real schema (models/UserRole.ts)
    // only has userId/roleId/businessId/assignedBy, no "businessMemberId"
    // at all. This route used to hard-require a "businessMemberId" that
    // doesn't exist anywhere in the schema and that the admin/users/[id]
    // page's simple "Assign Role" dropdown never sent -- every assignment
    // from that screen 400'd before ever reaching UserService.assignRole,
    // which is why assigning a role (including a pre-existing "system"
    // role) silently never applied.
    const { roleId, businessId } = body;

    if (!roleId) {
      return NextResponse.json(
        { error: "roleId is required" },
        { status: 400 }
      );
    }

    const result = await UserService.assignRole({
      userId,
      roleId,
      businessId,
      assignedBy: session.user.id,
    });

    logAction({
      action: "UPDATE",
      entity: "User",
      entityId: userId,
      after: { roleId, businessId },
      req,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal Server Error",
      },
      { status: 500 }
    );
  }
}
