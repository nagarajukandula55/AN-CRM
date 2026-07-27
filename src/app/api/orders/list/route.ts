export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { connectDB } from "@/lib/mongodb";

import Order from "@/models/Order";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

export async function GET(req: Request) {
  try {
    // Was completely unauthenticated with an optional businessId filter --
    // omitting businessId (or any caller not passing it, e.g. a storefront
    // fetching "my orders") returned EVERY order across EVERY business,
    // full customer PII and payment data included, to anyone who called
    // this route. Now requires a real session, and a plain customer
    // (no staff/admin permission on any business) only ever sees their own
    // orders -- never the business's full order list.
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const url = new URL(req.url);
    const requestedBusinessId = url.searchParams.get("businessId");

    let hasStaffAccess = false;
    if (session.isSuperAdmin) {
      hasStaffAccess = true;
    } else {
      try {
        requirePermission(session as any, buildPermissionCode("sales", "view"));
        hasStaffAccess = true;
      } catch {
        hasStaffAccess = false;
      }
    }

    const filter: Record<string, unknown> = {};

    if (hasStaffAccess) {
      // Staff/admin: scope to their own active business (or an explicit
      // businessId only a super admin may override) -- never unscoped.
      const bizId = session.isSuperAdmin
        ? requestedBusinessId || session.business?.businessId
        : session.business?.businessId;
      if (!bizId) {
        return NextResponse.json(
          { success: false, message: "Missing business context" },
          { status: 400 }
        );
      }
      filter.businessId = bizId;
    } else {
      // Plain customer session: only their own orders, regardless of any
      // businessId param they might pass.
      filter.userId = session.user.id;
    }

    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50")));

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Order.countDocuments(filter),
    ]);

    return NextResponse.json({
      success: true,
      orders,
      total,
      page,
      limit,
    });
  } catch (error: any) {
    console.log(error);

    return NextResponse.json(
      {
        success: false,
        message:
          error.message ||
          "Failed to fetch orders",
      },
      {
        status: 500,
      }
    );
  }
}
