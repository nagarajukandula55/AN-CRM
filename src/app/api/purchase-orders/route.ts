import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import {
  createPurchaseOrder,
  getAllPurchaseOrders,
} from "@/services/purchaseOrder.service";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

export async function POST(req: Request) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("purchase", "create"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    await connectDB();

    const body = await req.json();
    const data = await createPurchaseOrder(body);

    logAction({
      action: "CREATE",
      entity: "PurchaseOrder",
      entityId: (data as any)?._id?.toString?.() ?? (data as any)?._id,
      after: data,
      req,
      actor: { businessId: body?.businessId },
    });

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    // Was no auth check at all, and getAllPurchaseOrders() had no
    // businessId filter -- every caller could list every business's
    // purchase orders. Both fixed together.
    const session = await getEnrichedSession();
    if (!session?.user || !session.business) {
      return NextResponse.json({ success: false, message: "Unauthorized or missing business context" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("purchase", "view"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    await connectDB();

    // Vendor-scoped callers (see app/vendor/purchase) pass their own
    // vendorId to see only their own purchase orders.
    const vendorId = new URL(req.url).searchParams.get("vendorId") || undefined;
    const data = await getAllPurchaseOrders(session.business.businessId, vendorId);

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message },
      { status: 500 }
    );
  }
}
