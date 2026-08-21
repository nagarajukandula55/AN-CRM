/**
 * POST /api/subscriptions/verify — verifies the Razorpay payment signature
 * (same HMAC(order_id|payment_id, RAZORPAY_KEY_SECRET) check as
 * api/payment/verify/route.ts, reused here) and activates the
 * Subscription: sets status ACTIVE, startDate now, expiryDate = now +
 * billingPeriod's months. This is the "purchase verification confirmation"
 * step -- nothing else in the system treats a subscription as paid until
 * this signature check passes.
 *
 * Also raises a SubscriptionInvoice for the payment ("we have to raise
 * invoices once they paid right check for that flow" — this step was
 * previously missing: payment fields were recorded on the Subscription
 * itself but no invoice document existed) and, for an ULTIMATE-tier plan,
 * tops up this business's CommunicationQuota to that plan's bundled
 * email/WhatsApp allowance for the period just purchased.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import Subscription from "@/models/Subscription";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { logAction } from "@/lib/audit/logAction";
import { activateSubscription } from "@/core/subscriptions/activateSubscription";

export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    if (!process.env.RAZORPAY_KEY_SECRET) {
      return NextResponse.json({ success: false, message: "Payment gateway not configured" }, { status: 500 });
    }

    const body = await req.json();
    const { subscriptionId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
    if (!subscriptionId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ success: false, message: "Missing payment verification fields" }, { status: 400 });
    }

    await connectDB();
    const subscription = await Subscription.findById(subscriptionId);
    if (!subscription) {
      return NextResponse.json({ success: false, message: "Subscription not found" }, { status: 404 });
    }
    if (subscription.status === "ACTIVE") {
      return NextResponse.json({ success: true, duplicate: true, subscription });
    }
    if (subscription.razorpayOrderId !== razorpay_order_id) {
      return NextResponse.json({ success: false, message: "Gateway order mismatch" }, { status: 400 });
    }

    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return NextResponse.json({ success: false, message: "Invalid payment signature" }, { status: 400 });
    }

    const result = await activateSubscription(subscriptionId, razorpay_payment_id, razorpay_signature);
    if ("alreadyActive" in result) {
      // The Razorpay webhook (api/webhooks/razorpay) already claimed this
      // activation -- not an error, just nothing left for this call to do.
      return NextResponse.json({ success: true, duplicate: true, subscription: result.subscription });
    }
    if ("notFound" in result) {
      return NextResponse.json({ success: false, message: "Subscription not found" }, { status: 404 });
    }

    logAction({
      action: "VERIFY",
      entity: "Subscription",
      entityId: subscription._id.toString(),
      after: { plan: subscription.plan, billingPeriod: subscription.billingPeriod, expiryDate: result.expiryDate, invoiceNumber: result.invoice.invoiceNumber },
      req,
      actor: { id: session.user.id, businessId: subscription.businessId.toString() },
    });

    return NextResponse.json({ success: true, subscription: result.subscription, invoice: result.invoice });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
