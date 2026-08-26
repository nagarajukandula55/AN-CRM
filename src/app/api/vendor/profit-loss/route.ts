import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import SalesInvoice from "@/models/SalesInvoice";
import StockLedger from "@/models/StockLedger.js";
import Expense, { EXPENSE_CATEGORIES } from "@/models/Expense";
import { resolveVendorContext } from "@/lib/auth/vendorContext";

/**
 * GET /api/vendor/profit-loss?from=&to= — cash-basis Profit & Loss for the
 * logged-in vendor over a date range.
 *
 * Revenue = grandTotal of every non-cancelled Sales Invoice raised in the
 * range (cash-basis: counted at invoice date, not payment date -- matches
 * how a small shop actually thinks about "what I billed this month").
 *
 * COGS = material cost consumed in the range, read off StockLedger's own
 * OUT-type entries (quantity * rate, the rate the material was actually
 * issued at) -- this is a best-effort approximation, not a true matched
 * cost-of-the-exact-items-sold figure (that would need item-level cost
 * lots), but it's the only cost data this app actually captures today and
 * is the right order of magnitude for a shop owner's own P&L.
 *
 * Expenses = every non-deleted Expense entry in the range, grouped by
 * category for the breakdown.
 *
 * Net Profit = Revenue − COGS − Expenses. Deliberately NOT a statutory
 * P&L (no accruals, depreciation, or multi-account trial balance) --
 * see this feature's own scoping note: a small shop's cash-basis P&L,
 * not a Tally replacement.
 */
export async function GET(req: NextRequest) {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    await connectDB();
    const ctx = await resolveVendorContext(userId);
    if (!ctx) return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });
    const vendorId = (ctx.vendor as any)._id;

    const { searchParams } = new URL(req.url);
    const toStr = searchParams.get("to");
    const fromStr = searchParams.get("from");
    const now = new Date();
    const to = toStr ? new Date(toStr) : now;
    to.setHours(23, 59, 59, 999);
    const from = fromStr ? new Date(fromStr) : new Date(now.getFullYear(), now.getMonth(), 1);
    from.setHours(0, 0, 0, 0);

    const invoices = await SalesInvoice.find({
      vendorId,
      isDeleted: { $ne: true },
      status: { $ne: "CANCELLED" },
      createdAt: { $gte: from, $lte: to },
    })
      .select("grandTotal createdAt")
      .lean();
    const revenue = invoices.reduce((sum, inv: any) => sum + (inv.grandTotal || 0), 0);

    const outMovements = await (StockLedger as any)
      .find({ vendorId, type: "OUT", createdAt: { $gte: from, $lte: to } })
      .select("quantity rate")
      .lean();
    const cogs = outMovements.reduce((sum: number, m: any) => sum + Math.abs(m.quantity || 0) * (m.rate || 0), 0);

    const expenses = await Expense.find({ vendorId, isDeleted: { $ne: true }, date: { $gte: from, $lte: to } })
      .select("category amount")
      .lean();
    const expenseByCategory: Record<string, number> = {};
    for (const cat of EXPENSE_CATEGORIES) expenseByCategory[cat] = 0;
    for (const e of expenses as any[]) {
      expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + (e.amount || 0);
    }
    const totalExpenses = expenses.reduce((sum, e: any) => sum + (e.amount || 0), 0);

    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - totalExpenses;

    return NextResponse.json({
      success: true,
      range: { from: from.toISOString(), to: to.toISOString() },
      revenue,
      cogs,
      grossProfit,
      expenses: totalExpenses,
      expenseByCategory,
      netProfit,
      invoiceCount: invoices.length,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
