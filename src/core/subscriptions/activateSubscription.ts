/**
 * Activates a PENDING_PAYMENT Subscription after its payment is confirmed:
 * flips status ACTIVE, sets start/expiry dates, raises the
 * SubscriptionInvoice, and (for an ULTIMATE-tier plan) tops up this
 * business's CommunicationQuota. Pulled out of api/subscriptions/verify's
 * own route handler so api/webhooks/razorpay/route.ts (the server-side
 * safety net for a payment that captured but whose client-side verify call
 * never completed -- browser closed, network dropped) can share the exact
 * same activation logic instead of drifting out of sync with a second copy.
 *
 * Idempotent by construction, not by caller discipline: the actual status
 * flip is one atomic findOneAndUpdate filtered on status != ACTIVE, so if
 * the client's verify() call and a Razorpay webhook delivery both race in
 * (or Razorpay redelivers the same webhook, which it does retry), only one
 * of them ever wins the claim and raises the invoice -- the other gets
 * `alreadyActive: true` back instead of a duplicate SubscriptionInvoice.
 */
import Subscription, { type ISubscription } from "@/models/Subscription";
import SubscriptionInvoice, { type ISubscriptionInvoice } from "@/models/SubscriptionInvoice";
import CommunicationQuota from "@/models/CommunicationQuota";
import { generateDocumentNumber } from "@/core/numbering/numberingService";
import { BILLING_PERIODS, findPlan } from "@/core/pricing/plans";
import type { HydratedDocument } from "mongoose";

type ActivateResult =
  | { notFound: true }
  | { alreadyActive: true; subscription: HydratedDocument<ISubscription> }
  | { activated: true; subscription: HydratedDocument<ISubscription>; expiryDate: Date; invoice: HydratedDocument<ISubscriptionInvoice> };

export async function activateSubscription(
  subscriptionId: string,
  razorpayPaymentId: string,
  razorpaySignature?: string
): Promise<ActivateResult> {
  const existing = await Subscription.findById(subscriptionId);
  if (!existing) {
    return { notFound: true };
  }
  if (existing.status === "ACTIVE") {
    return { alreadyActive: true, subscription: existing };
  }

  const period = BILLING_PERIODS.find((p) => p.key === existing.billingPeriod) || BILLING_PERIODS[0];
  const now = new Date();
  const expiryDate = new Date(now);
  expiryDate.setMonth(expiryDate.getMonth() + period.months);

  const claimed = await Subscription.findOneAndUpdate(
    { _id: subscriptionId, status: { $ne: "ACTIVE" } },
    {
      $set: {
        status: "ACTIVE",
        razorpayPaymentId,
        ...(razorpaySignature ? { razorpaySignature } : {}),
        startDate: now,
        expiryDate,
      },
    },
    { new: true }
  );

  if (!claimed) {
    // Lost the race between the read above and this update -- some other
    // caller (webhook vs. client verify(), or a redelivered webhook)
    // already claimed activation. Not an error; just don't double-invoice.
    const fresh = await Subscription.findById(subscriptionId);
    return { alreadyActive: true as const, subscription: fresh! };
  }
  const subscription = claimed;

  // Prices are treated as GST-inclusive (standard SaaS practice) -- 18% is
  // backed out of the amount charged rather than added on top, so
  // amount === grandTotal.
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
    subBusinessOf: subscription.subBusinessOf || undefined,
    mode: subscription.mode,
    plan: subscription.plan,
    billingPeriod: subscription.billingPeriod,
    amount: subscription.amount - taxTotal,
    taxTotal,
    grandTotal: subscription.amount,
    periodStart: now,
    periodEnd: expiryDate,
    razorpayPaymentId,
  });

  // Ultimate-tier plans bundle WhatsApp quota -- activate/top-up on
  // successful payment for the business's own primary plan (not a sub-
  // vendor addon charge, which isn't a plan tier at all). Email is
  // explicitly out of scope for this quota (per direction) -- emailEnabled
  // stays off; only whatsappEnabled/whatsappQuota get set.
  if (!subscription.subVendorOf && !subscription.subBusinessOf) {
    const planDef = findPlan(subscription.mode, subscription.plan);
    if (planDef?.commsQuota) {
      await CommunicationQuota.findOneAndUpdate(
        { businessId: subscription.businessId },
        {
          $set: {
            whatsappEnabled: true,
            whatsappQuota: planDef.commsQuota.whatsappPerMonth,
            periodStart: now,
            whatsappUsed: 0,
          },
        },
        { upsert: true }
      );
    }
  }

  return { activated: true as const, subscription, expiryDate, invoice };
}
