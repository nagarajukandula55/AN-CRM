/**
 * Applies a PAID VendorBillingInvoice to its VendorSubscription -- extends
 * the paid-through period, writes the plan's modules/planKey/planName,
 * wires the sub-vendor-plan flag and WhatsApp comms quota, and fires the
 * payment-received alerts/email/notification. Shared by:
 *  - api/vendor/billing/invoices/[invoiceId]/confirm (the client-side path:
 *    Razorpay Checkout's success handler calls this immediately after
 *    verifying the signature itself).
 *  - api/webhooks/razorpay (the server-side safety net: Razorpay calls
 *    this directly on payment.captured, independent of whether the
 *    vendor's browser is even still open -- a closed tab, dropped
 *    network, or crashed browser right after a successful payment used to
 *    leave the invoice PENDING and the subscription never activated even
 *    though Razorpay had already captured the money, since only this
 *    confirm route ever applied a paid invoice, and only the client browser
 *    ever called it).
 *
 * Atomic claim (status: { $ne: "PAID" } in the findOneAndUpdate) means
 * calling this twice for the same invoice (once from confirm, once from
 * the webhook, racing each other) is safe -- only the first call actually
 * extends the period/sends notifications; the second just returns
 * alreadyActive.
 */
import VendorBillingInvoice from "@/models/VendorBillingInvoice";
import VendorSubscription from "@/models/VendorSubscription";
import VendorProfile from "@/models/VendorProfile";
import CommunicationQuota from "@/models/CommunicationQuota";
import { extendPeriod } from "@/core/billing/billing.service";
import { sendVendorAlert } from "@/core/telegram/sendVendorAlert";
import { notifyAdmins } from "@/core/telegram/notifyAdmins";
import { notifyUser } from "@/services/notification.service";
import { sendInvoiceEmail } from "@/services/email/resend.service";
import { findPlan, type OperatingMode } from "@/core/pricing/plans";
import Business from "@/models/Business";

export async function activateVendorInvoice(
  invoiceId: string,
  gatewayPaymentId: string
): Promise<{ activated: true; invoice: any; subscription: any } | { alreadyActive: true; invoice: any } | { activated: false; reason: string }> {
  const invoice = await VendorBillingInvoice.findById(invoiceId);
  if (!invoice) return { activated: false, reason: "invoice not found" };
  if (invoice.status === "PAID") return { alreadyActive: true, invoice };

  const vendor = await VendorProfile.findById(invoice.vendorId);
  if (!vendor) return { activated: false, reason: "vendor not found" };

  const subscription = await VendorSubscription.findById(invoice.subscriptionId);
  if (!subscription) return { activated: false, reason: "subscription not found" };

  // Atomic claim -- see this file's own comment on why calling this twice
  // for the same invoice (confirm + webhook racing) is safe.
  const claimed = await VendorBillingInvoice.findOneAndUpdate(
    { _id: invoiceId, status: { $ne: "PAID" } },
    { $set: { status: "PAID", paidAt: new Date(), gatewayPaymentId } },
    { new: true }
  );
  if (!claimed) return { alreadyActive: true, invoice };

  const validityDays = claimed.validityDays || subscription.validityDays;
  if (claimed.modules?.length) subscription.modules = claimed.modules as any;
  subscription.validityDays = validityDays;
  if (claimed.planKey) subscription.planKey = claimed.planKey;
  if (claimed.planName) subscription.planName = claimed.planName;

  // Whether this vendor has ever actually paid before -- every new signup
  // now gets a real currentPeriodEnd immediately from the free Ultimate
  // trial, so the old "!subscription.currentPeriodEnd" branch below never
  // actually fires in practice; a vendor's FIRST real purchase was
  // silently extending from the trial's own end date instead of from
  // today, stacking the leftover trial days on top of what they paid
  // for. Per explicit direction ("consider trial start date and plan
  // start date once purchased... change that to from purchase date...
  // plan start date and accordingly expiry date") -- a first purchase now
  // always starts fresh from today, discarding any unused trial time.
  // validityDays === 0 is the upgrade-proration case (see api/vendor/
  // billing/upgrade's own comment) -- that must NEVER reset the period,
  // it's explicitly meant to leave currentPeriodEnd untouched while only
  // swapping the tier, so it always uses the normal extend logic
  // regardless of prior-payment history.
  const hasPriorPaidInvoice =
    validityDays > 0 &&
    !!(await VendorBillingInvoice.exists({ vendorId: vendor._id, status: "PAID", _id: { $ne: claimed._id } }));

  let start: Date, end: Date;
  if (validityDays > 0 && !hasPriorPaidInvoice) {
    start = new Date();
    end = new Date(start.getTime() + validityDays * 24 * 60 * 60 * 1000);
  } else {
    ({ start, end } = extendPeriod(subscription.currentPeriodEnd, validityDays));
  }
  subscription.currentPeriodStart = start;
  subscription.currentPeriodEnd = end;
  await subscription.save();

  if (claimed.planKey) {
    // Sub-vendor / multi-center hierarchy is ULTIMATE-only -- see the
    // matching wiring in api/admin/vendor-billing/[vendorId]/route.ts's
    // own comment for why this can't be inferred from a raw modules list.
    await VendorProfile.updateOne(
      { _id: vendor._id },
      { $set: { "subVendorBilling.subVendorPlan": claimed.planKey === "ULTIMATE" ? "ALLOWED" : "BLOCKED" } }
    );

    const business = await Business.findById(vendor.businessId).select("operatingMode").lean();
    const mode = ((business as any)?.operatingMode || "SC") as OperatingMode;
    const planDef = findPlan(mode, claimed.planKey as any);
    if (planDef?.commsQuota) {
      await CommunicationQuota.findOneAndUpdate(
        { businessId: vendor.businessId },
        {
          $set: {
            whatsappEnabled: true,
            whatsappQuota: planDef.commsQuota.whatsappPerMonth,
            periodStart: new Date(),
            whatsappUsed: 0,
          },
        },
        { upsert: true }
      ).catch(() => {});
    }
  }

  sendVendorAlert(
    String(vendor._id),
    "PAYMENT_RECEIVED",
    `Payment received for invoice ${claimed.invoiceNumber} (₹${claimed.amount}). Subscription extended to ${end.toLocaleDateString("en-IN")}.`
  ).catch(() => {});

  notifyAdmins(
    `💰 <b>Payment received</b>\n${vendor.companyName || vendor.contactPerson} (${vendor.vendorId})\nInvoice ${claimed.invoiceNumber} · ₹${claimed.amount} · ${claimed.planName || "plan"}\nActive until ${end.toLocaleDateString("en-IN")}.`
  ).catch(() => {});

  if (vendor.email) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://crm.angroup.in";
    sendInvoiceEmail({
      to: vendor.email,
      customerName: vendor.companyName || vendor.contactPerson || "there",
      invoiceNumber: claimed.invoiceNumber,
      pdfUrl: `${appUrl}/invoice/${claimed.invoiceNumber}`,
      grandTotal: claimed.amount,
      businessId: String(vendor.businessId),
    }).catch(() => {});
  }

  if (vendor.userId) {
    notifyUser({
      userId: String(vendor.userId),
      businessId: String(vendor.businessId),
      title: "Payment received",
      message: `Invoice ${claimed.invoiceNumber} (₹${claimed.amount}) confirmed. Your plan is active until ${end.toLocaleDateString("en-IN")}.`,
      type: "success",
      link: "/vendor/billing",
    }).catch(() => {});
  }

  return { activated: true, invoice: claimed, subscription };
}
