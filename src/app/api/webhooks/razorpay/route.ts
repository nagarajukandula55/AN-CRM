import { NextResponse } from "next/server";
import crypto from "crypto";
import Order from "@/models/Order";
import { createInvoiceForOrder } from "@/lib/invoice/createInvoice";
import { getFinancialYear } from "@/core/numbering/financialYear";
import { logAction } from "@/lib/audit/logAction";
import { sendOrderNotification } from "@/lib/telegram/sendOrderNotification";

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const signature = req.headers.get("x-razorpay-signature");

    const secret = process.env.RAZORPAY_WEBHOOK_SECRET!;

    /* =========================================================
       VERIFY SIGNATURE (CRITICAL SECURITY STEP)
    ========================================================= */

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");

    const providedSignatureBuffer = Buffer.from(signature || "");
    const expectedSignatureBuffer = Buffer.from(expectedSignature);

    const signatureMatches =
      providedSignatureBuffer.length === expectedSignatureBuffer.length &&
      crypto.timingSafeEqual(providedSignatureBuffer, expectedSignatureBuffer);

    if (!signatureMatches) {
      return NextResponse.json(
        { success: false, message: "Invalid signature" },
        { status: 400 }
      );
    }

    const event = JSON.parse(body);

    /* =========================================================
       HANDLE PAYMENT SUCCESS ONLY
    ========================================================= */

    if (event.event !== "payment.captured") {
      return NextResponse.json({ success: true });
    }

    const paymentEntity = event.payload.payment.entity;

    const razorpayOrderId = paymentEntity.order_id;
    const paymentId = paymentEntity.id;

    /* =========================================================
       FIND ORDER
    ========================================================= */

    const order = await Order.findOne({
      "payment.gatewayOrderId": razorpayOrderId,
    });

    if (!order) {
      return NextResponse.json(
        { success: false, message: "Order not found" },
        { status: 404 }
      );
    }

    /* =========================================================
       IDEMPOTENCY CHECK (VERY IMPORTANT)
    ========================================================= */

    if (order.status === "PAID" && order.invoice?.invoiceNumber) {
      return NextResponse.json({ success: true });
    }

    /* =========================================================
       UPDATE PAYMENT STATUS
    ========================================================= */

    order.status = "PAID";
    order.payment.status = "SUCCESS";
    order.payment.amountPaid = paymentEntity.amount / 100;
    order.payment.paymentId = paymentId;

    /* =========================================================
       CREATE INVOICE (YOUR EXISTING MODULE)
    ========================================================= */

    const invoice =
      await createInvoiceForOrder(order.orderId);

    /* =========================================================
       ATTACH INVOICE
    ========================================================= */

    // fiscalYear/sequence were never real fields on Order's embedded
    // invoice sub-schema (it has `financialYear`, no `sequence` at all) --
    // silently dropped by mongoose on every save. Order.invoice.financialYear
    // wasn't being set at all as a result; fixed to actually set it.
    order.invoice = {
      invoiceType: order.gstType === "B2B" ? "B2B" : "TAX",
      invoiceNumber: invoice.invoiceNumber,
      financialYear: getFinancialYear(),
      pdfGenerated: false,
      locked: true,
    };

    /* =========================================================
       FINAL SAVE
    ========================================================= */

    order.events.push({
      type: "PAYMENT_SUCCESS",
      message: "Payment captured and invoice generated",
      createdAt: new Date(),
    });

    await order.save();

    logAction({
      action: "VERIFY",
      entity: "Order",
      entityId: order._id?.toString(),
      after: { status: order.status, payment: order.payment, invoice: order.invoice },
      req,
      actor: { businessId: order?.businessId?.toString() },
    });

    // Vendor payout split — see payment/verify/route.ts's identical call
    // for the full explanation. Safe to also run here: VendorSettlement's
    // unique (orderId, vendorId) index means whichever of this webhook or
    // the client-side verify route runs first "wins" the transfer attempt,
    // and the other is a no-op.
    try {
      const { settleOrderToVendors } = await import("@/core/payouts/vendorSettlement.service");
      const settlements = await settleOrderToVendors(order.orderId, paymentId);
      console.log("VENDOR SETTLEMENT RESULT (webhook):", JSON.stringify(settlements));
    } catch (err) {
      console.error("VENDOR SETTLEMENT ERROR (webhook, non-fatal):", err);
    }

    // Telegram order alert — this is the most common real-world
    // payment-confirmation path (Razorpay's server-to-server webhook), so
    // it previously never notified Telegram at all; only the less-common
    // client-driven /api/payment/verify path did. Non-fatal.
    try {
      await sendOrderNotification(order);
    } catch (err) {
      console.error("TELEGRAM NOTIFICATION ERROR (webhook, non-fatal):", err);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("WEBHOOK ERROR:", err);

    return NextResponse.json(
      { success: false, message: "Webhook failed" },
      { status: 500 }
    );
  }
}