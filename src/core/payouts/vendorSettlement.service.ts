import Order from "@/models/Order";
import VendorPayoutAccount from "@/models/VendorPayoutAccount";
import VendorSettlement from "@/models/VendorSettlement";
import { createTransfer } from "./razorpayRoute";

/**
 * Runs at payment-captured time (see api/payment/verify/route.ts and
 * api/webhooks/razorpay/route.ts — either can trigger this; it's
 * idempotent per order via VendorSettlement's unique (orderId, vendorId)
 * index, so it's safe to call from both without double-transferring).
 *
 * Groups the order's line items by vendorId, computes each vendor's gross
 * line-item total, platform commission, and net payout, then attempts a
 * Razorpay Route transfer for each vendor whose payout account is
 * ACTIVATED. Vendors with no payout account yet (or not yet activated by
 * Razorpay) get a PENDING settlement row instead of a transfer attempt —
 * an admin can re-run this later once they're activated (see the pending
 * settlements admin UI), rather than silently losing track of what's owed.
 */
export async function settleOrderToVendors(orderId: string, razorpayPaymentId: string) {
  const order = await Order.findOne({ orderId }).lean();
  if (!order) throw new Error(`Order ${orderId} not found`);

  const items = (order as any).cart || [];
  const byVendor = new Map<string, number>();
  for (const item of items) {
    if (!item.vendorId) continue; // platform-fulfilled line item, no vendor split
    const lineTotal = Number(item.lineTotal || 0);
    byVendor.set(item.vendorId, (byVendor.get(item.vendorId) || 0) + lineTotal);
  }

  const results: Array<{ vendorId: string; status: string; error?: string }> = [];

  for (const [vendorId, grossAmount] of byVendor.entries()) {
    // Already settled? (idempotency check before hitting Razorpay again)
    const existing = await VendorSettlement.findOne({ orderId, vendorId }).lean();
    if (existing) {
      results.push({ vendorId, status: (existing as any).status });
      continue;
    }

    const payoutAccount = await VendorPayoutAccount.findOne({ vendorId });
    const commissionPercent = payoutAccount?.platformCommissionPercent ?? 10;
    const commissionAmount = Math.round(grossAmount * (commissionPercent / 100) * 100) / 100;
    const netAmount = Math.round((grossAmount - commissionAmount) * 100) / 100;

    if (!payoutAccount || payoutAccount.status !== "ACTIVATED" || !payoutAccount.razorpayAccountId) {
      await VendorSettlement.create({
        orderId,
        vendorId,
        businessId: (order as any).businessId || payoutAccount?.businessId,
        payoutAccountId: payoutAccount?._id,
        grossAmount,
        platformCommissionPercent: commissionPercent,
        platformCommissionAmount: commissionAmount,
        netPayoutAmount: netAmount,
        status: "PENDING",
      });
      results.push({ vendorId, status: "PENDING" });
      continue;
    }

    try {
      const transfer = await createTransfer({
        razorpayPaymentId,
        razorpayAccountId: payoutAccount.razorpayAccountId,
        amountPaise: Math.round(netAmount * 100),
      });
      await VendorSettlement.create({
        orderId,
        vendorId,
        businessId: payoutAccount.businessId,
        payoutAccountId: payoutAccount._id,
        grossAmount,
        platformCommissionPercent: commissionPercent,
        platformCommissionAmount: commissionAmount,
        netPayoutAmount: netAmount,
        razorpayTransferId: transfer.id,
        status: "TRANSFERRED",
        transferredAt: new Date(),
      });
      results.push({ vendorId, status: "TRANSFERRED" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown transfer error";
      await VendorSettlement.create({
        orderId,
        vendorId,
        businessId: payoutAccount.businessId,
        payoutAccountId: payoutAccount._id,
        grossAmount,
        platformCommissionPercent: commissionPercent,
        platformCommissionAmount: commissionAmount,
        netPayoutAmount: netAmount,
        status: "FAILED",
        failureReason: message,
      });
      results.push({ vendorId, status: "FAILED", error: message });
    }
  }

  return results;
}

/** Re-attempt any PENDING settlements for vendors who've since been
 * activated — used by an admin action ("Retry payout") rather than
 * automatically polling, since Razorpay activation timing is out of our
 * control and a background poller is a separate, larger piece of
 * infrastructure than this scaffolding covers. */
export async function retryPendingSettlement(settlementId: string) {
  const settlement = await VendorSettlement.findById(settlementId);
  if (!settlement) throw new Error("Settlement not found");
  if (settlement.status !== "PENDING" && settlement.status !== "FAILED") {
    throw new Error(`Settlement is already ${settlement.status}`);
  }

  const payoutAccount = await VendorPayoutAccount.findById(settlement.payoutAccountId);
  if (!payoutAccount || payoutAccount.status !== "ACTIVATED" || !payoutAccount.razorpayAccountId) {
    throw new Error("Vendor's payout account is not activated yet");
  }

  const order = await Order.findOne({ orderId: settlement.orderId }).lean();
  const razorpayPaymentId = (order as any)?.payment?.gatewayPaymentId;
  if (!razorpayPaymentId) throw new Error("Original order has no captured payment id to transfer against");

  const transfer = await createTransfer({
    razorpayPaymentId,
    razorpayAccountId: payoutAccount.razorpayAccountId,
    amountPaise: Math.round(settlement.netPayoutAmount * 100),
  });

  settlement.razorpayTransferId = transfer.id;
  settlement.status = "TRANSFERRED";
  settlement.transferredAt = new Date();
  settlement.failureReason = undefined;
  await settlement.save();
  return settlement;
}
