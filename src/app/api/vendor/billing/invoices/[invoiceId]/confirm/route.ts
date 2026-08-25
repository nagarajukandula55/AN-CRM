import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import VendorBillingInvoice from "@/models/VendorBillingInvoice";
import VendorSubscription from "@/models/VendorSubscription";
import Business from "@/models/Business";
import CommunicationQuota from "@/models/CommunicationQuota";
import { resolveVendorContext } from "@/lib/auth/vendorContext";
import { verifyRazorpaySignature } from "@/core/billing/paymentGateway";
import { extendPeriod } from "@/core/billing/billing.service";
import { sendVendorAlert } from "@/core/telegram/sendVendorAlert";
import { notifyUser } from "@/services/notification.service";
import { sendInvoiceEmail } from "@/services/email/resend.service";
import { findPlan, type OperatingMode } from "@/core/pricing/plans";

// POST /api/vendor/billing/invoices/:invoiceId/confirm
// Body: { razorpayOrderId, razorpayPaymentId, razorpaySignature } -- the
// three values Razorpay Checkout hands back to the client on success.
// This is the ONLY thing that may mark an invoice PAID, and it only does
// so after recomputing Razorpay's HMAC signature server-side and
// confirming it matches -- a request cannot forge this without our
// RAZORPAY_KEY_SECRET, which never leaves the server. Previously this
// route trusted a bare "I paid" claim with zero verification (any vendor
// could self-confirm their own invoice for free) -- see git history.
export async function POST(req: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const { invoiceId } = await params;
    const body = await req.json().catch(() => ({}));
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = body;
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return NextResponse.json({ success: false, message: "Missing payment verification fields" }, { status: 400 });
    }

    await connectDB();
    const ctx = await resolveVendorContext(userId);
    if (!ctx) return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });

    const vendor = ctx.vendor as any;
    const invoice = await VendorBillingInvoice.findOne({ _id: invoiceId, vendorId: vendor._id });
    if (!invoice) return NextResponse.json({ success: false, message: "Invoice not found" }, { status: 404 });
    if (invoice.status === "PAID") {
      return NextResponse.json({ success: true, invoice });
    }
    // The order this signature was issued for must match the one WE
    // created for this invoice (invoice.gatewayRef, set in pay/route.ts)
    // -- otherwise a valid signature from a DIFFERENT order/invoice could
    // be replayed here to mark an unrelated invoice paid.
    if (invoice.gatewayRef !== razorpayOrderId) {
      return NextResponse.json({ success: false, message: "Order mismatch for this invoice" }, { status: 400 });
    }

    const verified = verifyRazorpaySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature });
    if (!verified) {
      return NextResponse.json({ success: false, message: "Payment verification failed" }, { status: 402 });
    }

    // Atomic claim -- guards against a double-click/retry sending two
    // concurrent requests with the same valid signature both passing the
    // status check above and both extending the subscription period. Only
    // the request that actually flips PENDING -> PAID here proceeds to
    // extend the subscription; a second concurrent request finds no
    // matching document (status already PAID) and just returns the
    // already-confirmed invoice, same pattern as activateSubscription's
    // atomic claim for the customer-subscription flow.
    const claimed = await VendorBillingInvoice.findOneAndUpdate(
      { _id: invoiceId, vendorId: vendor._id, status: { $ne: "PAID" } },
      { $set: { status: "PAID", paidAt: new Date(), gatewayPaymentId: razorpayPaymentId } },
      { new: true }
    );
    if (!claimed) {
      const current = await VendorBillingInvoice.findById(invoiceId);
      return NextResponse.json({ success: true, invoice: current });
    }

    const subscription = await VendorSubscription.findById(claimed.subscriptionId);
    if (!subscription) return NextResponse.json({ success: false, message: "Subscription not found" }, { status: 404 });

    // Apply the modules/validityDays/plan SNAPSHOTTED ON THE INVOICE (set
    // at invoice-creation time, see api/vendor/billing/subscribe) onto the
    // subscription only now, having just verified real money moved --
    // never trust whatever the live subscription doc holds, since a
    // self-serve vendor could otherwise get access by creating an invoice
    // and abandoning checkout. A no-op for the admin-generated-invoice
    // flow, where the subscription's modules were already set (by a
    // trusted admin) to the same values before the invoice existed.
    const validityDays = claimed.validityDays || subscription.validityDays;
    if (claimed.modules?.length) subscription.modules = claimed.modules as any;
    subscription.validityDays = validityDays;
    if (claimed.planKey) subscription.planKey = claimed.planKey;
    if (claimed.planName) subscription.planName = claimed.planName;

    let start: Date, end: Date;
    if (!subscription.currentPeriodEnd) {
      // FIRST payment ever for this vendor -- per explicit direction, the
      // paid period is calculated from their original signup date (every
      // vendor gets a free trial from self-signup, see
      // VendorProfile.trialEndsAt), not from today's payment date, so
      // trial days are absorbed into the first billing cycle instead of
      // stacking as extra free time on top of it. Floored at "now" so a
      // vendor who pays well after signup + validityDays has already
      // elapsed doesn't end up with an already-expired subscription the
      // moment they pay -- that edge case falls back to the normal
      // extend-from-now behavior.
      // earlyAccessAnchor overrides createdAt for the one-time pre-launch
      // signup window (see VendorProfile.earlyAccessAnchor's own comment)
      // -- a vendor who signed up before go-live counts their first paid
      // period from the anchor date, not their real (earlier) signup date.
      const signupBase = vendor.earlyAccessAnchor || vendor.createdAt;
      const signupBasedEnd = new Date(signupBase.getTime() + validityDays * 24 * 60 * 60 * 1000);
      if (signupBasedEnd.getTime() > Date.now()) {
        start = new Date();
        end = signupBasedEnd;
      } else {
        ({ start, end } = extendPeriod(subscription.currentPeriodEnd, validityDays));
      }
    } else {
      ({ start, end } = extendPeriod(subscription.currentPeriodEnd, validityDays));
    }
    subscription.currentPeriodStart = start;
    subscription.currentPeriodEnd = end;
    await subscription.save();

    // Ultimate-tier plans bundle a WhatsApp customer-notification quota --
    // grant/top-up on this confirmed payment, same as the older
    // business-Subscription flow in activateSubscription.ts, which this
    // self-serve vendor flow doesn't otherwise share code with. Email is
    // deliberately excluded here (out of scope, per direction).
    if (claimed.planKey) {
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

    // Emails the vendor their own GST invoice (buildInvoiceEmailTemplate,
    // see services/email/resend.service.ts) -- this event previously only
    // ever reached Telegram and the in-app bell, neither of which a vendor
    // can forward to their accountant the way an email with the invoice
    // link can. pdfUrl points at the printable /invoice/:number page
    // (this app has no separate PDF-generation route) -- the "Download
    // invoice" button in the email opens/prints that page.
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

    // In-app notification (the top-right bell) -- this event previously
    // only ever reached Telegram, so a vendor with no/unlinked Telegram
    // chat had no record of their own payment anywhere in the app itself.
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

    return NextResponse.json({ success: true, invoice: claimed, subscription });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
