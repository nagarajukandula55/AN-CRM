import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Order from "@/models/Order";

/* ================= CORS ================= */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/* ================= OPTIONS ================= */

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/* ================= GET ORDER ================= */

export async function GET(req: Request) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);

    const orderId = searchParams.get("orderId");

    if (!orderId) {
      return NextResponse.json(
        {
          success: false,
          message: "Order ID missing",
        },
        { status: 400, headers: corsHeaders }
      );
    }

    console.log("SEARCHING ORDER:", orderId);

    /* ================= FIND ORDER ================= */

    const order: any = await Order.findOne({
      $or: [
        { orderId },
        { "shipping.awbNumber": orderId },
      ],
    }).lean();

    if (!order) {
      return NextResponse.json(
        {
          success: false,
          message: "Order not found",
        },
        { status: 404, headers: corsHeaders }
      );
    }

    /* ================= NORMALIZE ITEMS ================= */

    const items =
      order.items?.length
        ? order.items
        : order.cart?.length
        ? order.cart
        : [];

    /* ================= RESPONSE ================= */

    return NextResponse.json(
      {
        success: true,

        order: {
          orderId: order.orderId,
          status: order.status,
          amount: order.amount,
          createdAt: order.createdAt,

          address: {
            name: order.address?.name || "",
            phone: order.address?.phone || "",
            email: order.address?.email || "",
            city: order.address?.city || "",
            state: order.address?.state || "",
            addressLine1:
              order.address?.addressLine1 || "",
          },

          payment: {
            status: order.payment?.status || "PENDING",
            method: order.payment?.method || "",
            utr: order.payment?.utr || "",
          
            transactionId:
              order.payment?.transactionId ||
              order.payment?.razorpayPaymentId ||
              "",
          
            razorpayOrderId:
              order.payment?.razorpayOrderId || "",
          },

          shipping: {
            awbNumber:
              order.shipping?.awbNumber || "",

            trackingStatus:
              order.shipping?.trackingStatus ||
              "PENDING",

            courierPartner:
              order.shipping?.courierPartner ||
              "",

            labelUrl:
              order.shipping?.labelUrl || "",
          },

          invoice: {
              invoiceNumber:
                order.invoice?.invoiceNumber || "",
            
              invoiceUrl:
                order.invoice?.invoiceUrl || "",
            
              pdfGenerated:
                order.invoice?.pdfGenerated || false,
            },

          items,
        },
      },
      { headers: corsHeaders }
    );
  } catch (err: any) {
    console.error("GET ORDER ERROR", err);

    return NextResponse.json(
      {
        success: false,
        message: err.message || "Internal error",
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
