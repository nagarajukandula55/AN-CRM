export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { connectDB } from "@/lib/mongodb";

import { createShipment } from "@/lib/shipping/create-shipment";

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
      requirePermission(session as any, buildPermissionCode("logistics", "create"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    await connectDB();

    const body = await req.json();

    const {
      orderId,
      dispatchType,
      courierPartner,
      courierId,
      awbNumber,
      trackingUrl,
      by,
    
      weight,
      length,
      width,
      height,
    } = body;

    const result =
      await createShipment({
      orderId,
      dispatchType,
      courierPartner,
      courierId,
      awbNumber,
      trackingUrl,
      by,
    
      weight,
      length,
      width,
      height,
    });

    logAction({
      action: "CREATE_SHIPMENT",
      entity: "Order",
      entityId: result?.order?._id?.toString(),
      after: result?.order,
      req,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.log(error);

    return NextResponse.json(
      {
        success: false,
        message:
          error.message ||
          "Shipment failed",
      },
      {
        status: 500,
      }
    );
  }
}
