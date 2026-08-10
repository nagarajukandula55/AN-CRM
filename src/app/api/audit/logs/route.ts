import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import AuditLog from "@/models/AuditLog";
// Required for .populate("businessId") below -- model must be registered
// before populate can resolve it.
import "@/models/Business";

/* =========================================================
 * GET AUDIT LOGS
 * =======================================================*/
export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    requirePermission(session as any, buildPermissionCode("audit", "view"));

    const { searchParams } = new URL(req.url);

    const userId = searchParams.get("userId");
    const entity = searchParams.get("entity");
    const entityId = searchParams.get("entityId");
    // A super admin viewing a specific business's activity log (e.g. from
    // the Businesses page) needs logs for THAT business, not their own --
    // they have none. Only a super admin may pass an explicit businessId;
    // everyone else is confined to their own active business's logs.
    const requestedBusinessId = searchParams.get("businessId");

    if (!session.isSuperAdmin && !session.business) {
      return NextResponse.json(
        { error: "Unauthorized or missing business context" },
        { status: 401 }
      );
    }

    // Every non-super-admin is confined to their own active business's
    // logs, unchanged. A super admin may pass an explicit businessId to
    // view one vendor's activity, or omit it entirely to see EVERY
    // vendor's actions in one feed -- per explicit direction ("for every
    // action record vendor id... only super admin can see all the data").
    // Previously a super admin who omitted businessId got a 401 instead
    // of the cross-vendor view they're the one account meant to have.
    const targetBusinessId =
      session.isSuperAdmin && requestedBusinessId
        ? requestedBusinessId
        : !session.isSuperAdmin
          ? session.business?.businessId
          : null;

    if (!session.isSuperAdmin && !targetBusinessId) {
      return NextResponse.json(
        { error: "Unauthorized or missing business context" },
        { status: 401 }
      );
    }

    const query: any = {};
    if (targetBusinessId) query.businessId = new Types.ObjectId(targetBusinessId);

    if (userId) query.userId = new Types.ObjectId(userId);
    if (entity) query.entity = entity;
    if (entityId) query.entityId = entityId;

    // businessId populated with name/businessCode so a super admin's
    // cross-vendor feed shows WHICH vendor each action belongs to, not
    // just an opaque ObjectId -- per explicit direction ("in super admin
    // view give vendor name and id").
    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("businessId", "name businessCode");

    return NextResponse.json({
      success: true,
      data: logs,
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
 * CREATE AUDIT LOG (SYSTEM + MANUAL EVENTS)
 * =======================================================*/
export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();

    if (!session?.user || !session.business) {
      return NextResponse.json(
        { error: "Unauthorized or missing business context" },
        { status: 401 }
      );
    }

    requirePermission(session as any, buildPermissionCode("audit", "create"));

    const body = await req.json();

    const {
      action,
      entity,
      entityId,
      before,
      after,
      metadata,
    } = body;

    if (!action || !entity) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const log = await AuditLog.create({
      businessId: new Types.ObjectId(session.business.businessId),
      userId: new Types.ObjectId(session.user.id),
      action,
      entity,
      entityId: entityId
        ? new Types.ObjectId(entityId)
        : null,
      before,
      after,
      metadata,
      createdAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      data: log,
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
