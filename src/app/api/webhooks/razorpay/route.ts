/**
 * POST /api/webhooks/razorpay — Razorpay calls this directly (configured
 * in the Razorpay Dashboard > Webhooks, pointed at this URL with events
 * "payment.captured" and "order.paid" checked) whenever a payment
 * captures, independent of whether the customer's browser is even still
 * open. This is the server-side safety net for api/subscriptions/verify:
 * that route only ever runs if the customer's browser successfully
 * completes the Razorpay Checkout round trip and calls it -- a closed tab,
 * a dropped network, or a crashed browser right after a successful payment
 * would otherwise leave the Subscription stuck PENDING_PAYMENT forever
 * even though Razorpay actually captured the money.
 *
 * Auth is the HMAC signature itself (RAZORPAY_WEBHOOK_SECRET, set once
 * when creating the webhook in the Razorpay Dashboard -- a DIFFERENT
 * secret from RAZORPAY_KEY_SECRET used for the Checkout signature), not a
 * session -- see middleware.ts's PUBLIC_PREFIXES entry for this path.
 * Verified over the RAW request body, so this reads req.text() rather than
 * req.json() -- re-serializing a parsed body before hashing would very
 * likely produce a different byte sequence than what Razorpay actually
 * signed (key order, whitespace) and fail verification unpredictably.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import Subscription from "@/models/Subscription";
import VendorBillingInvoice from "@/models/VendorBillingInvoice";
import { activateSubscription } from "@/core/subscriptions/activateSubscription";
import { activateVendorInvoice } from "@/core/billing/activateVendorInvoice";
import { logAction } from "@/lib/audit/logAction";

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      // Not configured yet -- ack with 200 so Razorpay doesn't retry-storm
      // a URL we haven't finished setting up, but do nothing. The
      // client-side verify() flow still works fine without this.
      return NextResponse.json({ success: true, skipped: "webhook not configured" });
    }

    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature");
    if (!signature) {
      return NextResponse.json({ success: false, message: "Missing signature" }, { status: 400 });
    }

    const expectedSignature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    if (expectedSignature !== signature) {
      return NextResponse.json({ success: false, message: "Invalid signature" }, { status: 400 });
    }

    const event = JSON.parse(rawBody);
    const eventType = event?.event as string | undefined;

    // Only these two ever indicate a captured payment worth acting on --
    // every other event type (refund, dispute, order.paid duplicate of
    // payment.captured, etc.) is acknowledged and ignored.
    if (eventType !== "payment.captured" && eventType !== "order.paid") {
      return NextResponse.json({ success: true, ignored: eventType || "unknown event" });
    }

    const paymentEntity = event?.payload?.payment?.entity;
    const razorpayOrderId: string | undefined = paymentEntity?.order_id;
    const razorpayPaymentId: string | undefined = paymentEntity?.id;
    if (!razorpayOrderId || !razorpayPaymentId) {
      return NextResponse.json({ success: false, message: "Missing order/payment id in payload" }, { status: 400 });
    }

    await connectDB();
    const subscription = await Subscription.findOne({ razorpayOrderId }).select("_id status");
    if (subscription) {
      if (subscription.status === "ACTIVE") {
        return NextResponse.json({ success: true, duplicate: true });
      }
      const result = await activateSubscription(subscription._id.toString(), razorpayPaymentId);
      if ("activated" in result) {
        logAction({
          action: "VERIFY",
          entity: "Subscription",
          entityId: subscription._id.toString(),
          after: { via: "razorpay-webhook", event: eventType, expiryDate: result.expiryDate, invoiceNumber: result.invoice.invoiceNumber },
          req,
          actor: { id: "razorpay-webhook", businessId: result.subscription.businessId.toString() },
        });
      }
      return NextResponse.json({ success: true });
    }

    // Not a legacy business-level Subscription order -- check the vendor
    // self-serve billing flow (VendorBillingInvoice.gatewayRef, see
    // api/vendor/billing/subscribe/route.ts) before giving up. Without
    // this, a vendor whose browser closed/crashed right after Razorpay
    // Checkout succeeded (so api/vendor/billing/invoices/[id]/confirm --
    // the only OTHER path that can mark an invoice paid -- never ran) had
    // their invoice stuck PENDING and their plan never activated, even
    // though Razorpay had already captured the money. Reported live as a
    // request to verify "payment confirmations and subscription
    // allocations thoroughly."
    const vendorInvoice = await VendorBillingInvoice.findOne({ gatewayRef: razorpayOrderId }).select("_id status");
    if (vendorInvoice) {
      if (vendorInvoice.status === "PAID") {
        return NextResponse.json({ success: true, duplicate: true });
      }
      const result = await activateVendorInvoice(vendorInvoice._id.toString(), razorpayPaymentId);
      if ("reason" in result) {
        return NextResponse.json({ success: false, message: result.reason }, { status: 500 });
      }
      logAction({
        action: "VERIFY",
        entity: "VendorBillingInvoice",
        entityId: vendorInvoice._id.toString(),
        after: { via: "razorpay-webhook", event: eventType, invoiceNumber: result.invoice.invoiceNumber },
        req,
        actor: { id: "razorpay-webhook", businessId: String(result.invoice.businessId) },
      });
      return NextResponse.json({ success: true });
    }

    // Not every Razorpay order in this account is a subscription purchase
    // of either kind (e.g. a storefront checkout order) -- ack, don't error.
    return NextResponse.json({ success: true, ignored: "no matching subscription/invoice for this order" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    // Razorpay retries a non-2xx response -- 500 here is correct (transient
    // failure, e.g. a DB hiccup, should be retried), unlike the 400s above
    // for a bad signature/payload, which retrying would never fix.
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
