import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import Expense, { EXPENSE_CATEGORIES } from "@/models/Expense";
import { resolveVendorContext } from "@/lib/auth/vendorContext";

// GET /api/vendor/expenses?from=&to= — the logged-in vendor's own expenses,
// newest first, optionally scoped to a date range (feeds both the Expenses
// list page and the Profit & Loss report).
export async function GET(req: NextRequest) {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    await connectDB();
    const ctx = await resolveVendorContext(userId);
    if (!ctx) return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");

    const filter: Record<string, any> = { vendorId: (ctx.vendor as any)._id, isDeleted: { $ne: true } };
    if (fromStr || toStr) {
      filter.date = {};
      if (fromStr) filter.date.$gte = new Date(fromStr);
      if (toStr) {
        const toDate = new Date(toStr);
        toDate.setHours(23, 59, 59, 999);
        filter.date.$lte = toDate;
      }
    }

    const expenses = await Expense.find(filter).sort({ date: -1 }).lean();
    const total = expenses.reduce((sum, e: any) => sum + (e.amount || 0), 0);

    return NextResponse.json({ success: true, expenses, total, categories: EXPENSE_CATEGORIES });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// POST /api/vendor/expenses — record a new expense.
export async function POST(req: NextRequest) {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    await connectDB();
    const ctx = await resolveVendorContext(userId);
    if (!ctx) return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });

    const body = await req.json();
    const { date, category, description, amount, paymentMode } = body;

    if (!category || !EXPENSE_CATEGORIES.includes(category)) {
      return NextResponse.json({ success: false, message: "Valid category is required" }, { status: 400 });
    }
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return NextResponse.json({ success: false, message: "Amount must be a positive number" }, { status: 400 });
    }

    const expense = await Expense.create({
      businessId: (ctx.vendor as any).businessId,
      vendorId: (ctx.vendor as any)._id,
      date: date ? new Date(date) : new Date(),
      category,
      description: description?.trim() || undefined,
      amount: amountNum,
      paymentMode: paymentMode || "CASH",
      createdBy: userId,
    });

    return NextResponse.json({ success: true, expense });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
