export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Order from "@/models/Order";
import { getShiprocketToken } from "@/lib/shipping/shiprocket";
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
      weight = 0.5,
      length = 10,
      width = 10,
      height = 10,
    } = body;

    console.log("BODY:", body);
    console.log("ORDER ID:", orderId);

    if (!orderId) {
      return NextResponse.json(
        {
          success: false,
          message: "Order ID required",
        },
        { status: 400 }
      );
    }

    const order: any = await Order.findOne({
      orderId: String(orderId).trim(),
    })
      .lean()
      .exec();

    console.log(
      "ORDER FOUND:",
      order ? "YES" : "NO"
    );

    if (!order) {
      return NextResponse.json(
        {
          success: false,
          message: "Order not found",
        },
        { status: 404 }
      );
    }

    const pickupPincode =
      process.env.SHIPROCKET_PICKUP_PINCODE;

    const deliveryPincode =
      order?.address?.pincode;

    console.log(
      "PICKUP PINCODE:",
      pickupPincode
    );

    console.log(
      "DELIVERY PINCODE:",
      deliveryPincode
    );

    if (!pickupPincode) {
      return NextResponse.json(
        {
          success: false,
          message:
            "SHIPROCKET_PICKUP_PINCODE missing",
        },
        { status: 500 }
      );
    }

    if (!deliveryPincode) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Customer pincode missing",
        },
        { status: 400 }
      );
    }

    const token =
      await getShiprocketToken();

    console.log(
      "SHIPROCKET TOKEN RECEIVED"
    );

    const url =
      `https://apiv2.shiprocket.in/v1/external/courier/serviceability/?pickup_postcode=${pickupPincode}` +
      `&delivery_postcode=${deliveryPincode}` +
      `&cod=0` +
      `&weight=${weight}`;

    console.log(
      "SHIPROCKET URL:",
      url
    );

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type":
          "application/json",
      },
    });

    const result = await response.json();

    console.log(
      "SHIPROCKET RESPONSE:",
      JSON.stringify(result, null, 2)
    );

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          message:
            result?.message ||
            "Shiprocket error",
          shiprocket: result,
        },
        { status: 400 }
      );
    }

    const availableCouriers =
      result?.data
        ?.available_courier_companies ||
      [];

    console.log(
      "COURIERS COUNT:",
      availableCouriers.length
    );

    const couriers =
      availableCouriers.map(
        (c: any) => ({
          courierId:
            c.courier_company_id,

          courierName:
            c.courier_name,

          rate:
            c.freight_charge,

          etd:
            c.estimated_delivery_days,

          companyId:
            c.courier_company_id,

          srData: c,
        })
      );

    return NextResponse.json({
      success: true,
      couriers,
      total: couriers.length,
    });
  } catch (error: any) {
    console.error(
      "SHIPPING RATE ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          error?.message ||
          "Failed loading rates",
      },
      {
        status: 500,
      }
    );
  }
}
