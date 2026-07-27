import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import CreditAccount from "@/models/CreditAccount";
import CreditTransaction from "@/models/CreditTransaction";
import { resolveVendorContext } from "@/lib/auth/vendorContext";
import { getDaysOverdue } from "@/core/credit/creditLedger";

// GET /api/vendor/credit-accounts/:id — account detail + its ledger.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    await connectDB();
    const ctx = await resolveVendorContext(userId);
    if (!ctx) return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });
    const vendor = ctx.vendor as any;

    const account = await CreditAccount.findOne({ _id: id, vendorId: vendor._id }).lean();
    if (!account) return NextResponse.json({ success: false, message: "Account not found" }, { status: 404 });

    const transactions = await CreditTransaction.find({ accountId: id }).sort({ createdAt: -1 }).lean();
    const daysOverdue = await getDaysOverdue(id);
    return NextResponse.json({ success: true, account: { ...account, daysOverdue }, transactions });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// PATCH /api/vendor/credit-accounts/:id — edit limit/days/contact/active.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const allowed = ["name", "type", "contactPerson", "phone", "email", "creditLimit", "creditDays", "isActive", "notes"];
    for (const key of allowed) {
      if (body[key] !== undefined) (account as any)[key] = body[key];
    }
    await account.save();

    return NextResponse.json({ success: true, data: account });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
