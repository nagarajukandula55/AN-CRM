import { NextRequest, NextResponse } from "next/server";
import { RoleService } from "@/services/role/role.service";
import { auth } from "@/lib/auth/auth";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

/* =========================================================
 * GET ROLES
 * =======================================================*/
export async function GET(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);

    const organizationId = searchParams.get("organizationId");
    const businessId = searchParams.get("businessId") || undefined;

    if (!organizationId) {
      return NextResponse.json(
        { error: "organizationId is required" },
        { status: 400 }
      );
    }

    const roles = await RoleService.getRoles({
      organizationId,
      businessId,
    });

    return NextResponse.json({
      success: true,
      data: roles,
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

/* =========================================================
 * CREATE ROLE
 * =======================================================*/
export async function POST(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const enrichedSession = await getEnrichedSession();
    try {
      requirePermission(enrichedSession as any, buildPermissionCode("roles", "create"));
    } catch (err: any) {
      return NextResponse.json(
        { error: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    const body = await req.json();

    const {
      organizationId,
      businessId,
      name,
      code,
      description,
    } = body;

    if (!organizationId || !name || !code) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const role = await RoleService.createRole({
      organizationId,
      businessId,
      name,
      code,
      description,
      createdBy: session.user.id,
    });

    logAction({
      action: "CREATE",
      entity: "Role",
      entityId: (role as any)?._id?.toString(),
      after: role,
      req,
    });

    return NextResponse.json({
      success: true,
      data: role,
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
