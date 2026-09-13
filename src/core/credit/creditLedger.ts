import CreditAccount, { ICreditAccount } from "@/models/CreditAccount";
import CreditTransaction from "@/models/CreditTransaction";

export class CreditLimitError extends Error {}

/** Records a credit sale against an account, checking creditLimit first.
 * Shared by the vendor's manual "Record Transaction" action and the B2B
 * ordering portal's checkout (when paymentMode is CREDIT), so both paths
 * enforce the same limit check and FIFO-aging setup. */
export async function recordInvoice(
  account: InstanceType<typeof CreditAccount>,
  amount: number,
  opts: { referenceOrderId?: string; notes?: string; createdBy?: string } = {}
) {
  if (account.creditLimit > 0 && account.outstandingBalance + amount > account.creditLimit) {
    throw new CreditLimitError(
      `This would put ${account.name} at ₹${(account.outstandingBalance + amount).toFixed(2)}, over their ₹${account.creditLimit} credit limit.`
    );
  }

  account.outstandingBalance = Math.round((account.outstandingBalance + amount) * 100) / 100;
  await account.save();

  const dueDate = account.creditDays ? new Date(Date.now() + account.creditDays * 24 * 60 * 60 * 1000) : null;

  return CreditTransaction.create({
    businessId: account.businessId,
    vendorId: account.vendorId,
    accountId: account._id,
    type: "INVOICE",
    amount,
    outstandingAmount: amount,
    balanceAfter: account.outstandingBalance,
    referenceOrderId: opts.referenceOrderId,
    dueDate,
    notes: opts.notes,
    createdBy: opts.createdBy,
  });
}

/** Records a payment/adjustment, drawing it down FIFO against the oldest
 * still-outstanding INVOICE entries first -- this is what makes
 * getOldestOverdueInvoice() below meaningful once an account has several
 * invoices in flight; a single running balance alone can't say which
 * specific invoice is overdue. */
export async function recordPaymentOrAdjustment(
  account: InstanceType<typeof CreditAccount>,
  amount: number,
  type: "PAYMENT" | "ADJUSTMENT",
  opts: { notes?: string; createdBy?: string } = {}
) {
  let remaining = amount;
  const openInvoices = await CreditTransaction.find({
    accountId: account._id,
    type: "INVOICE",
    outstandingAmount: { $gt: 0 },
  }).sort({ createdAt: 1 });

  for (const inv of openInvoices) {
    if (remaining <= 0) break;
    const applied = Math.min(inv.outstandingAmount, remaining);
    inv.outstandingAmount = Math.round((inv.outstandingAmount - applied) * 100) / 100;
    await inv.save();
    remaining -= applied;
  }

  account.outstandingBalance = Math.round((account.outstandingBalance - amount) * 100) / 100;
  await account.save();

  return CreditTransaction.create({
    businessId: account.businessId,
    vendorId: account.vendorId,
    accountId: account._id,
    type,
    amount,
    outstandingAmount: 0,
    balanceAfter: account.outstandingBalance,
    notes: opts.notes,
    createdBy: opts.createdBy,
  });
}

/** Days overdue on this account's oldest unsettled invoice (0 if none, or
 * none are past due yet). */
export async function getDaysOverdue(accountId: string): Promise<number> {
  const oldest = await CreditTransaction.findOne({
    accountId,
    type: "INVOICE",
    outstandingAmount: { $gt: 0 },
    dueDate: { $ne: null },
  })
    .sort({ dueDate: 1 })
    .lean();

  if (!oldest?.dueDate) return 0;
  const overdueMs = Date.now() - new Date(oldest.dueDate).getTime();
  return overdueMs > 0 ? Math.floor(overdueMs / (24 * 60 * 60 * 1000)) : 0;
}

/** Same as getDaysOverdue(), batched across many accounts in one query
 * instead of one findOne() per account (see api/vendor/credit-accounts,
 * which used to call getDaysOverdue() once per row in the account list). */
export async function getDaysOverdueForAccounts(accountIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (accountIds.length === 0) return result;

  const openInvoices = await CreditTransaction.find({
    accountId: { $in: accountIds },
    type: "INVOICE",
    outstandingAmount: { $gt: 0 },
    dueDate: { $ne: null },
  })
    .sort({ dueDate: 1 })
    .lean();

  const now = Date.now();
  for (const inv of openInvoices as any[]) {
    const key = String(inv.accountId);
    if (result.has(key)) continue; // sorted ascending -- first hit per account is the oldest
    const overdueMs = now - new Date(inv.dueDate).getTime();
    result.set(key, overdueMs > 0 ? Math.floor(overdueMs / (24 * 60 * 60 * 1000)) : 0);
  }
  return result;
}
