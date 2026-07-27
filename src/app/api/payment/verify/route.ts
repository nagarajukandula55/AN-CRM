export const runtime = "nodejs";

import { NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import Order from "@/models/Order";
import Coupon from "@/models/Coupon";
import { sendOrderNotification }
from "@/lib/telegram/sendOrderNotification";
import { sendInvoiceEmail }
from "@/services/email/resend.service";
import { logAction } from "@/lib/audit/logAction";

/* =========================================================
   CORS
========================================================= */

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

/* =========================================================
   OPTIONS
========================================================= */

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");

  return new NextResponse(null, {
    status: 200,
    headers: getCorsHeaders(origin),
  });
}

/* =========================================================
   VERIFY PAYMENT API
========================================================= */

export async function POST(req: Request) {
  const origin = req.headers.get("origin");

  try {
    await connectDB();

    if (!process.env.RAZORPAY_KEY_SECRET) {
      throw new Error(
        "Missing RAZORPAY_KEY_SECRET"
      );
    }

    const body = await req.json();

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId,
    } = body;

    console.log(
      "VERIFY PAYMENT BODY:",
      body
    );

    /* =========================================================
       VALIDATION
    ========================================================= */

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      !orderId
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Missing payment verification fields",
        },
        {
          status: 400,
          headers: getCorsHeaders(origin),
        }
      );
    }

    /* =========================================================
       FIND ORDER
    ========================================================= */

    const order =
      await Order.findOne({
        orderId,
      });

    if (!order) {
      return NextResponse.json(
        {
          success: false,
          message: "Order not found",
        },
        {
          status: 404,
          headers: getCorsHeaders(origin),
        }
      );
    }

    console.log(
      "ORDER FOUND:",
      {
        orderId:
          order.orderId,

        storedGatewayOrderId:
          order.payment
            ?.gatewayOrderId,

        receivedGatewayOrderId:
          razorpay_order_id,
      }
    );

    /* =========================================================
       ALREADY VERIFIED
    ========================================================= */

    if (
      order.paymentVerified === true
    ) {
      return NextResponse.json(
        {
          success: true,
          duplicate: true,
          orderId,
        },
        {
          headers: getCorsHeaders(origin),
        }
      );
    }

    /* =========================================================
       VERIFY ORDER ID
    ========================================================= */

    console.log("COMPARE:", {
      frontend:
        razorpay_order_id,

      database:
        order.payment
          ?.gatewayOrderId,
    });

    console.log("TYPES:", {
      frontendType:
        typeof razorpay_order_id,

      databaseType:
        typeof order.payment
          ?.gatewayOrderId,
    });

    if (
      String(
        razorpay_order_id
      ).trim() !==
      String(
        order.payment
          ?.gatewayOrderId
      ).trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Gateway order mismatch",
        },
        {
          status: 400,
          headers: getCorsHeaders(origin),
        }
      );
    }

    /* =========================================================
       VERIFY SIGNATURE
    ========================================================= */

    const generatedSignature =
      crypto
        .createHmac(
          "sha256",
          process.env
            .RAZORPAY_KEY_SECRET
        )
        .update(
          `${razorpay_order_id}|${razorpay_payment_id}`
        )
        .digest("hex");

    const isValidSignature =
      generatedSignature ===
      razorpay_signature;

    console.log(
      "SIGNATURE CHECK:",
      {
        generatedSignature,
        razorpay_signature,
        isValidSignature,
      }
    );

    /* =========================================================
       INVALID SIGNATURE
    ========================================================= */

    if (!isValidSignature) {
      order.payment.status =
        "FAILED";

      order.status =
        "PAYMENT_FAILED";

      await order.save();

      return NextResponse.json(
        {
          success: false,
          message:
            "Invalid payment signature",
        },
        {
          status: 400,
          headers: getCorsHeaders(origin),
        }
      );
    }

    /* =========================================================
       PAYMENT SUCCESS
    ========================================================= */

    order.paymentVerified = true;

    order.status = "PAID";

    order.payment.status =
      "SUCCESS";

    order.payment.gatewayPaymentId =
      razorpay_payment_id;

    order.payment.gatewaySignature =
      razorpay_signature;

    order.payment.paidAt =
      new Date();

    order.payment.amountPaid =
      order.amount;

    await order.save();

    logAction({
      action: "VERIFY",
      entity: "Order",
      entityId: order._id?.toString(),
      after: { status: order.status, payment: order.payment },
      req,
      actor: { businessId: order?.businessId?.toString() },
    });

    // Invoice generation (single or dual B2B+B2C, per
    // createInvoiceForOrder's Business.invoicingRules.dualInvoiceMode
    // check) — this route previously never generated an invoice at all,
    // so order.invoice.invoiceNumber stayed empty and the invoice email
    // below silently sent with no invoice number/link. Non-fatal: an
    // invoicing hiccup must never block the customer-facing payment
    // confirmation this handler still has to return.
    try {
      const { createInvoiceForOrder } = await import("@/lib/invoice/createInvoice");
      const invoice = await createInvoiceForOrder(order.orderId);
      order.invoice = {
        invoiceType: order.gstType === "B2B" ? "B2B" : "TAX",
        invoiceNumber: (invoice as any)?.invoiceNumber,
        financialYear: order.invoice?.financialYear,
        pdfGenerated: false,
        locked: true,
      } as any;
      order.invoiceGenerated = true;
      await order.save();
    } catch (err) {
      console.error("INVOICE GENERATION ERROR (verify, non-fatal):", err);
    }

    // Vendor payout split — transfers each vendor's share of this order to
    // their Razorpay Route linked account, if activated (falls back to a
    // PENDING settlement row otherwise; see vendorSettlement.service.ts).
    // Deliberately non-fatal: a payout hiccup must never block the
    // customer-facing payment confirmation the rest of this handler still
    // has to return.
    try {
      const { settleOrderToVendors } = await import("@/core/payouts/vendorSettlement.service");
      const settlements = await settleOrderToVendors(order.orderId, razorpay_payment_id);
      console.log("VENDOR SETTLEMENT RESULT:", JSON.stringify(settlements));
    } catch (err) {
      console.error("VENDOR SETTLEMENT ERROR (non-fatal):", err);
    }

   /* ==========================================
      UPDATE COUPON USAGE
   ========================================== */
      
      if (order.coupon) {
        try {
          await Coupon.updateOne(
           {
             code: order.coupon.toUpperCase(),
           },
           {
             $inc: {
               usedCount: 1,
             },
             $push: {
               usedBy: order.orderId,
             },
           }
         );
      
          console.log(
            "COUPON USAGE UPDATED:",
            order.couponCode
          );
        } catch (couponErr) {
          console.error(
            "COUPON UPDATE FAILED:",
            couponErr
          );
        }
      }

     console.log("EMAIL DEBUG", {
     customerEmail: order?.customer?.email,
     addressEmail: order?.address?.email,
   });
      
      await sendOrderNotification(order);

          console.log(
           "ORDER EMAIL DATA",
           JSON.stringify(
             {
               customer: order.customer,
               address: order.address,
             },
             null,
             2
           )
         );

try {

  const emailAddress =
    order?.customer?.email ||
    order?.address?.email;

  console.log("EMAIL DEBUG:", {
    emailAddress,
    customer: order?.customer,
    address: order?.address,
  });

  if (emailAddress) {

    const emailResult =
      await sendInvoiceEmail({
        to: emailAddress,

        customerName:
          order?.address?.name ||
          order?.customer?.name ||
          "Customer",

        invoiceNumber:
          order?.invoice?.invoiceNumber ||
          order.orderId,

        pdfUrl:
          order?.invoice?.invoiceUrl ||
          "",

        grandTotal:
          order.amount || 0,

        orderId:
          order.orderId,

        businessId:
          order?.businessId?.toString?.() || order?.businessId,
      });

    console.log(
      "EMAIL RESULT:",
      JSON.stringify(emailResult, null, 2)
    );

  } else {

    console.error(
      "NO CUSTOMER EMAIL FOUND"
    );

  }

} catch (emailErr) {

  console.error(
    "EMAIL FAILED:",
    emailErr
  );

}

await sendOrderNotification(order);

try {

  // email code here

} catch (emailErr) {

  console.error(
    "EMAIL FAILED:",
    emailErr
  );

}

console.log(
  "PAYMENT VERIFIED:",
  orderId
);
     
    /* =========================================================
       SUCCESS RESPONSE
    ========================================================= */

    return NextResponse.json(
      {
        success: true,

        message:
          "Payment verified successfully",

        orderId,
      },
      {
        headers: getCorsHeaders(origin),
      }
    );

  } catch (err: any) {
    console.error(
      "PAYMENT VERIFY ERROR:",
      err
    );

    return NextResponse.json(
      {
        success: false,

        message:
          err?.message ||
          "Payment verification failed",
      },
      {
        status: 500,
        headers: getCorsHeaders(origin),
      }
    );
  }
}
