export const runtime = "nodejs";

import { NextResponse } from "next/server";
import crypto from "crypto";
import mongoose from "mongoose";

import { connectDB } from "@/lib/mongodb";

import Order from "@/models/Order";
import WebhookLog from "@/models/WebhookLog";

import {
  reserveStock,
} from "@/lib/order/reserveStock";
import { logAction } from "@/lib/audit/logAction";
import { sendOrderNotification } from "@/lib/telegram/sendOrderNotification";

/* =========================================================
   HELPERS
========================================================= */

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    aBuffer,
    bBuffer
  );
}

/* =========================================================
   SUCCESS PAYMENT PROCESSOR
========================================================= */

async function processSuccessfulPayment({
  payment,
  event,
  razorpaySignature,
}: {
  payment: any;
  event: any;
  razorpaySignature: string;
}) {
  /* =========================================================
     BASIC VALIDATION
  ========================================================= */

  if (!payment) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid payment payload",
      },
      { status: 400 }
    );
  }

  if (payment.status !== "captured") {
    return NextResponse.json(
      {
        success: false,
        message: "Payment not captured",
      },
      { status: 400 }
    );
  }

  if (payment.currency !== "INR") {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid currency",
      },
      { status: 400 }
    );
  }

  const orderId =
    payment?.notes?.orderId;

  if (!orderId) {
    return NextResponse.json(
      {
        success: false,
        message: "Order ID missing",
      },
      { status: 400 }
    );
  }

  /* =========================================================
     PAYMENT REPLAY PROTECTION
  ========================================================= */

  const existingPayment =
    await Order.findOne({
      "payment.gatewayPaymentId":
        payment.id,
    });

  if (existingPayment) {
    return NextResponse.json({
      success: true,
      duplicate: true,
      replayBlocked: true,
    });
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
      { status: 404 }
    );
  }

  /* =========================================================
     EXPIRED ORDER CHECK
  ========================================================= */

  if (
    order.expiresAt &&
    new Date(order.expiresAt) <
      new Date()
  ) {
    order.events.push({
      type: "ORDER_EXPIRED_PAYMENT_ATTEMPT",

      message:
        "Payment received after order expiry",

      data: {
        paymentId: payment.id,
      },

      createdAt: new Date(),
    });

    await order.save();

    return NextResponse.json(
      {
        success: false,
        message: "Order expired",
      },
      { status: 400 }
    );
  }

  /* =========================================================
     VERIFY RAZORPAY ORDER ID
  ========================================================= */

  if (
    payment.order_id !==
    order.payment?.gatewayOrderId
  ) {
    order.events.push({
      type: "PAYMENT_ORDER_MISMATCH",

      message:
        "Gateway order ID mismatch",

      data: {
        razorpayOrderId:
          payment.order_id,

        dbGatewayOrderId:
          order.payment
            ?.gatewayOrderId,
      },

      createdAt: new Date(),
    });

    await order.save();

    return NextResponse.json(
      {
        success: false,
        message:
          "Gateway order mismatch",
      },
      { status: 400 }
    );
  }

  /* =========================================================
     IDEMPOTENCY CHECK
  ========================================================= */

  if (
    order.paymentVerified ||
    order.payment?.status ===
      "SUCCESS"
  ) {
    return NextResponse.json({
      success: true,
      duplicate: true,
    });
  }

  /* =========================================================
     AMOUNT VALIDATION
  ========================================================= */

  const paidAmount =
    Number(payment.amount || 0) /
    100;

  if (
    Number(order.amount) !==
    Number(paidAmount)
  ) {
    order.events.push({
      type:
        "PAYMENT_AMOUNT_MISMATCH",

      message:
        "Webhook payment amount mismatch",

      data: {
        orderAmount:
          order.amount,

        paidAmount,

        paymentId:
          payment.id,
      },

      createdAt: new Date(),
    });

    await order.save();

    return NextResponse.json(
      {
        success: false,
        message: "Amount mismatch",
      },
      { status: 400 }
    );
  }

  /* =========================================================
     FRAUD CHECKS
  ========================================================= */

  if (
    payment.contact &&
    order.address?.phone &&
    String(payment.contact).slice(-10) !==
      String(order.address.phone).slice(
        -10
      )
  ) {
    order.events.push({
      type:
        "PAYMENT_CONTACT_MISMATCH",

      message:
        "Payment contact differs from order phone",

      data: {
        paymentContact:
          payment.contact,

        orderPhone:
          order.address.phone,
      },

      createdAt: new Date(),
    });
  }

  /* =========================================================
     TRANSACTION
  ========================================================= */

  const session =
    await mongoose.startSession();

  try {
    session.startTransaction();

    /* ================= PAYMENT ================= */

    order.payment.status =
      "SUCCESS";

    order.payment
      .gatewayPaymentId =
      payment.id;

    order.payment
      .gatewaySignature =
      razorpaySignature;

    order.payment.paidAt =
      payment.captured_at
        ? new Date(
            payment.captured_at * 1000
          )
        : new Date();

    order.payment.amountPaid =
      paidAmount;

    order.payment.rawWebhook =
      event;

   /* =========================================================
   RESERVE STOCK
========================================================= */

if (!order.stockReserved) {
  const stockResult =
    await reserveStock(
      order.cart
    );

  if (!stockResult.success) {
    order.status =
      "STOCK_FAILED";

    order.events.push({
      type:
        "STOCK_RESERVATION_FAILED",

      message:
        stockResult.message,

      createdAt:
        new Date(),
    });

    await order.save();

    return NextResponse.json(
      {
        success: false,
        message:
          stockResult.message,
      },
      { status: 400 }
    );
  }

  order.stockReserved =
    true;
}

    /* ================= ORDER ================= */

    order.paymentVerified = true;

    order.stockReserved = false;

    order.invoiceGenerated =
      false;

    order.shipmentCreated =
      false;

    order.locked = true;

    order.status = "PAID";

    /* ================= EVENTS ================= */

    order.events.push({
      type:
        "PAYMENT_SUCCESS_WEBHOOK",

      message:
        "Payment confirmed via Razorpay webhook",

      data: {
        paymentId:
          payment.id,

        razorpayOrderId:
          payment.order_id,

        orderId,

        amount:
          paidAmount,

        method:
          payment.method,

        email:
          payment.email,

        contact:
          payment.contact,
      },

      createdAt: new Date(),
    });

    /* =========================================================
       TODO PIPELINE FLAGS
    ========================================================= */

    order.events.push({
      type: "POST_PAYMENT_PENDING",

      message:
        "Pending stock reservation, invoice generation and shipment creation",

      createdAt: new Date(),
    });

    /* ================= SAVE ================= */

    await order.save({
      session,
    });

    await session.commitTransaction();

    logAction({
      action: "VERIFY",
      entity: "Order",
      entityId: order._id?.toString(),
      after: { status: order.status, payment: order.payment },
      actor: { businessId: order?.businessId?.toString() },
    });

    // Invoice generation (single or dual B2B+B2C, per
    // createInvoiceForOrder's Business.invoicingRules.dualInvoiceMode
    // check) — this webhook previously left invoiceGenerated=false with no
    // follow-up, so a PAID order via this path never got an invoice at
    // all. Non-fatal: an invoicing hiccup must not fail the payment
    // confirmation itself.
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
      console.error("INVOICE GENERATION ERROR (webhook, non-fatal):", err);
    }

    // Vendor payout split — see payment/verify/route.ts's identical call
    // for the full explanation. Safe to also run here.
    try {
      const { settleOrderToVendors } = await import("@/core/payouts/vendorSettlement.service");
      const settlements = await settleOrderToVendors(order.orderId, payment.id);
      console.log("VENDOR SETTLEMENT RESULT (payment/webhook):", JSON.stringify(settlements));
    } catch (err) {
      console.error("VENDOR SETTLEMENT ERROR (payment/webhook, non-fatal):", err);
    }

    // Telegram order alert — this is one of the two server-to-server
    // payment-confirmation paths (the other being webhooks/razorpay); like
    // that one, it previously never notified Telegram, only the
    // client-driven /api/payment/verify path did. Non-fatal.
    try {
      await sendOrderNotification(order);
    } catch (err) {
      console.error("TELEGRAM NOTIFICATION ERROR (payment/webhook, non-fatal):", err);
    }

    return NextResponse.json({
      success: true,
    });
  } catch (err: any) {
    await session.abortTransaction();

    console.error(
      "PAYMENT PROCESS ERROR:",
      err
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "Payment processing failed",
      },
      { status: 500 }
    );
  } finally {
    session.endSession();
  }
}

/* =========================================================
   WEBHOOK
========================================================= */

export async function POST(req: Request) {
  let webhookLog: any = null;

  try {
    await connectDB();

    /* =========================================================
       ENV VALIDATION
    ========================================================= */

    if (
      !process.env
        .RAZORPAY_WEBHOOK_SECRET
    ) {
      throw new Error(
        "Missing RAZORPAY_WEBHOOK_SECRET"
      );
    }

    /* =========================================================
       RAW BODY
    ========================================================= */

    const rawBody =
      await req.text();

    /* =========================================================
       SIGNATURE VALIDATION
    ========================================================= */

    const razorpaySignature =
      req.headers.get(
        "x-razorpay-signature"
      ) || "";

    const expectedSignature =
      crypto
        .createHmac(
          "sha256",
          process.env
            .RAZORPAY_WEBHOOK_SECRET
        )
        .update(rawBody)
        .digest("hex");

    const isValidSignature =
      safeEqual(
        razorpaySignature,
        expectedSignature
      );

    if (!isValidSignature) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Invalid webhook signature",
        },
        { status: 400 }
      );
    }

    /* =========================================================
       PARSE EVENT
    ========================================================= */

    const event =
      JSON.parse(rawBody);

    const eventType =
      event?.event;

    /* =========================================================
       WEBHOOK LOG
    ========================================================= */

    webhookLog =
      await WebhookLog.create({
        event: eventType,

        payload: event,

        signature:
          razorpaySignature,

        processed: false,

        receivedAt: new Date(),
      });

    /* =========================================================
       PAYMENT CAPTURED
    ========================================================= */

    if (
      eventType ===
      "payment.captured"
    ) {
      const response =
        await processSuccessfulPayment(
          {
            payment:
              event?.payload
                ?.payment?.entity,

            event,

            razorpaySignature,
          }
        );

      webhookLog.processed = true;

      await webhookLog.save();

      return response;
    }

    /* =========================================================
       ORDER PAID
    ========================================================= */

    if (
      eventType ===
      "order.paid"
    ) {
      const response =
        await processSuccessfulPayment(
          {
            payment:
              event?.payload
                ?.payment?.entity,

            event,

            razorpaySignature,
          }
        );

      webhookLog.processed = true;

      await webhookLog.save();

      return response;
    }

    /* =========================================================
       PAYMENT FAILED
    ========================================================= */

    if (
      eventType ===
      "payment.failed"
    ) {
      const payment =
        event?.payload?.payment
          ?.entity;

      if (!payment) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Invalid failed payment payload",
          },
          { status: 400 }
        );
      }

      const orderId =
        payment?.notes?.orderId;

      if (!orderId) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Order ID missing",
          },
          { status: 400 }
        );
      }

      const order =
        await Order.findOne({
          orderId,
        });

      if (!order) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Order not found",
          },
          { status: 404 }
        );
      }

      order.payment.status =
        "FAILED";

      order.payment
        .gatewayPaymentId =
        payment?.id || null;

      order.payment.rawWebhook =
        event;

      order.status =
        "PAYMENT_FAILED";

      order.events.push({
        type: "PAYMENT_FAILED",

        message:
          "Payment failed via Razorpay webhook",

        data: {
          paymentId:
            payment?.id,

          reason:
            payment?.error_description ||
            payment?.error_reason ||
            "Unknown",
        },

        createdAt: new Date(),
      });

      await order.save();

      logAction({
        action: "UPDATE",
        entity: "Order",
        entityId: order._id?.toString(),
        after: { status: order.status, payment: order.payment },
        actor: { businessId: order?.businessId?.toString() },
      });

      webhookLog.processed = true;

      await webhookLog.save();

      return NextResponse.json({
        success: true,
      });
    }

    /* =========================================================
       PAYMENT AUTHORIZED
    ========================================================= */

    if (
      eventType ===
      "payment.authorized"
    ) {
      const payment =
        event?.payload?.payment
          ?.entity;

      const orderId =
        payment?.notes?.orderId;

      if (orderId) {
        const order =
          await Order.findOne({
            orderId,
          });

        if (order) {
          order.events.push({
            type:
              "PAYMENT_AUTHORIZED",

            message:
              "Payment authorized",

            data: {
              paymentId:
                payment?.id,
            },

            createdAt:
              new Date(),
          });

          await order.save();
        }
      }

      webhookLog.processed = true;

      await webhookLog.save();

      return NextResponse.json({
        success: true,
      });
    }

    /* =========================================================
       UNHANDLED EVENTS
    ========================================================= */

    webhookLog.processed = true;

    await webhookLog.save();

    return NextResponse.json({
      success: true,
      ignored: true,
      event: eventType,
    });
  } catch (err: any) {
    console.error(
      "RAZORPAY WEBHOOK ERROR:",
      err
    );

    if (webhookLog) {
      webhookLog.error =
        err?.message;

      await webhookLog.save();
    }

    return NextResponse.json(
      {
        success: false,

        message:
          err?.message ||
          "Webhook processing failed",
      },
      { status: 500 }
    );
  }
}
