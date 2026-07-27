export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Order from "@/models/Order";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { compareRates } from "@/services/shipping/compareRates";

/**
 * POST /api/shipping/compare-rates
 *
 * "Best of the best service in affordable rates": given an order (or an
 * explicit pickup/delivery pincode + weight), calls getRates() across every
 * courier provider the business has enabled and configured, and returns all
 * quotes sorted cheapest-first plus the single cheapest option. Providers
 * that aren't configured are skipped silently (see compareRates.ts) — this
 * never errors out just because Delhivery/Bluedart/etc aren't set up yet.
 */
export async function POST(req: Request) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user || !session.business) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("logistics", "view"));
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
      pickupPincode: pickupPincodeInput,
      deliveryPincode: deliveryPincodeInput,
      weight = 0.5,
      cod = false,
    } = body;

    let deliveryPincode = deliveryPincodeInput;

    if (orderId && !deliveryPincode) {
      const order: any = await Order.findOne({ orderId: String(orderId).trim() }).lean();
      if (!order) {
        return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
      }
      deliveryPincode = order?.address?.pincode;
    }

    const pickupPincode = pickupPincodeInput || process.env.SHIPROCKET_PICKUP_PINCODE;

    if (!pickupPincode) {
      return NextResponse.json(
        { success: false, message: "Pickup pincode missing (SHIPROCKET_PICKUP_PINCODE or pickupPincode)" },
        { status: 400 }
      );
    }

    if (!deliveryPincode) {
      return NextResponse.json(
        { success: false, message: "Delivery pincode missing" },
        { status: 400 }
      );
    }

    const result = await compareRates(session.business.businessId, {
      pickupPincode: String(pickupPincode),
      deliveryPincode: String(deliveryPincode),
      weight: Number(weight),
      cod: !!cod,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Failed comparing rates" },
      { status: 500 }
    );
  }
}
