import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import CreditAccount from "@/models/CreditAccount";
import { resolveVendorContext } from "@/lib/auth/vendorContext";
import { recordInvoice, recordPaymentOrAdjustment, CreditLimitError } from "@/core/credit/creditLedger";

/**
 * POST /api/vendor/credit-accounts/:id/transactions — record a credit
 * sale (INVOICE, raises outstanding) or a payment received (PAYMENT/
 * ADJUSTMENT, lowers it, FIFO against the oldest open invoices) against
 * this account. See core/credit/creditLedger.ts for the shared logic --
 * the B2B ordering portal's checkout uses the same recordInvoice() when a
 * partner pays on credit.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    await connectDB();
    const ctx = await resolveVendorContext(userId);
    if (!ctx) return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });
    const vendor = ctx.vendor as any;

    const account = await CreditAccount.findOne({ _id: id, vendorId: vendor._id });
    if (!account) return NextResponse.json({ success: false, message: "Account not found" }, { status: 404 });

    const body = await req.json();
    const type = ["INVOICE", "PAYMENT", "ADJUSTMENT"].includes(body.type) ? body.type : null;
    const amount = Number(body.amount);
    if (!type) return NextResponse.json({ success: false, message: "type must be INVOICE, PAYMENT, or ADJUSTMENT" }, { status: 400 });
    if (!amount || amount <= 0) return NextResponse.json({ success: false, message: "amount must be greater than 0" }, { status: 400 });

    const transaction =
      type === "INVOICE"
        ? await recordInvoice(account, amount, { notes: body.notes, createdBy: userId })
        : await recordPaymentOrAdjustment(account, amount, type, { notes: body.notes, createdBy: userId });

    return NextResponse.json({ success: true, transaction, account });
  } catch (err: any) {
    if (err instanceof CreditLimitError) {
      return NextResponse.json({ success: false, message: err.message }, { status: 400 });
    }
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
