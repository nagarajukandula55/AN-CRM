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
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import Subscription from "@/models/Subscription";
import SubscriptionInvoice from "@/models/SubscriptionInvoice";
import CommunicationQuota from "@/models/CommunicationQuota";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { logAction } from "@/lib/audit/logAction";
import { generateDocumentNumber } from "@/core/numbering/numberingService";
import { BILLING_PERIODS, findPlan } from "@/core/pricing/plans";

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

    const period = BILLING_PERIODS.find((p) => p.key === subscription.billingPeriod) || BILLING_PERIODS[0];
    const now = new Date();
    const expiryDate = new Date(now);
    expiryDate.setMonth(expiryDate.getMonth() + period.months);

    subscription.status = "ACTIVE";
    subscription.razorpayPaymentId = razorpay_payment_id;
    subscription.razorpaySignature = razorpay_signature;
    subscription.startDate = now;
    subscription.expiryDate = expiryDate;
    await subscription.save();

    // Raise the invoice for this payment. Prices are treated as GST-
    // inclusive (standard SaaS practice) — 18% is backed out of the amount
    // charged rather than added on top, so amount === grandTotal.
    const taxTotal = Math.round(subscription.amount - subscription.amount / 1.18);
    const { value: invoiceNumber } = await generateDocumentNumber(
      subscription.businessId.toString(),
      "SUBSCRIPTION_INVOICE"
    );
    const invoice = await SubscriptionInvoice.create({
      invoiceNumber,
      businessId: subscription.businessId,
      subscriptionId: subscription._id,
      subVendorOf: subscription.subVendorOf || undefined,
      mode: subscription.mode,
      plan: subscription.plan,
      billingPeriod: subscription.billingPeriod,
      amount: subscription.amount - taxTotal,
      taxTotal,
      grandTotal: subscription.amount,
      periodStart: now,
      periodEnd: expiryDate,
      razorpayPaymentId: razorpay_payment_id,
    });

    // Ultimate-tier plans bundle Email/WhatsApp quota — activate/top-up on
    // successful payment for the business's own primary plan (not a sub-
    // vendor addon charge, which isn't a plan tier at all).
    if (!subscription.subVendorOf) {
      const planDef = findPlan(subscription.mode, subscription.plan);
      if (planDef?.commsQuota) {
        await CommunicationQuota.findOneAndUpdate(
          { businessId: subscription.businessId },
          {
            $set: {
              emailEnabled: true,
              whatsappEnabled: true,
              emailQuota: planDef.commsQuota.emailPerMonth,
              whatsappQuota: planDef.commsQuota.whatsappPerMonth,
              periodStart: now,
              emailUsed: 0,
              whatsappUsed: 0,
            },
          },
          { upsert: true }
        );
      }
    }

    logAction({
      action: "VERIFY",
      entity: "Subscription",
      entityId: subscription._id.toString(),
      after: { plan: subscription.plan, billingPeriod: subscription.billingPeriod, expiryDate, invoiceNumber },
      req,
      actor: { id: session.user.id, businessId: subscription.businessId.toString() },
    });

    return NextResponse.json({ success: true, subscription, invoice });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
