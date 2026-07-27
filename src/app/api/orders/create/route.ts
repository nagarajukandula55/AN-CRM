import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { OrderService } from "@/services/order.service";
import { logAction } from "@/lib/audit/logAction";

const allowedOrigins = [
  "https://shopnative.in",
  "https://www.shopnative.in",
  "https://angroup.in",
  "https://www.angroup.in",
];

function getCorsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin":
      origin && allowedOrigins.includes(origin)
        ? origin
        : "",
    "Access-Control-Allow-Methods":
      "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization",
  };
}

/* =========================================
   OPTIONS
========================================= */

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");

  return new NextResponse(null, {
    status: 200,
    headers: getCorsHeaders(origin),
  });
}

/* =========================================
   POST
========================================= */

export async function POST(req: Request) {
  const origin = req.headers.get("origin");

  try {
    console.log(
      "============ CREATE ORDER API ============"
    );

    // MAIN AN DB (Orders + Products) -- ProductService now resolves
    // products from the same NativeProduct model/connection everything
    // else uses; the separate legacy "native" DB connection is no longer
    // needed here (see product.service.ts's comment for the full story).
    await connectDB();

    const body = await req.json();

    console.log(
      "ORDER PAYLOAD:",
      JSON.stringify(body, null, 2)
    );

    const result =
      await OrderService.createOrder(body);

    console.log(
      "ORDER CREATED:",
      result.orderId
    );

    logAction({
      action: "CREATE",
      entity: "Order",
      entityId: result.orderId,
      after: body,
      req,
    });

    return NextResponse.json(
      {
        success: true,
        orderId: result.orderId,
        amount: result.amount,
        isBulkOrder: result.isBulkOrder,
        items: result.items,
        razorpayOrder: result.razorpayOrder,
        subtotal: result.subtotal,
        discount: result.discount,
        taxableAmount: result.taxableAmount,
        gstTotal: result.gstTotal,
        cgst: result.cgst,
        sgst: result.sgst,
        igst: result.igst,
      },
      {
        headers: getCorsHeaders(origin),
      }
    );

  } catch (err: any) {
    console.error("ORDER CREATE FAILED:");
    console.error(err);

    return NextResponse.json(
      {
        success: false,
        error: err?.message,
      },
      {
        status: 500,
        headers: getCorsHeaders(origin),
      }
    );
  }
}
