import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import Expense from "@/models/Expense";
import { resolveVendorContext } from "@/lib/auth/vendorContext";

// DELETE /api/vendor/expenses/[id] — soft-delete one of the vendor's own
// expense entries.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    await connectDB();
    const ctx = await resolveVendorContext(userId);
    if (!ctx) return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });

    const { id } = await params;
    const expense = await Expense.findOne({ _id: id, vendorId: (ctx.vendor as any)._id });
    if (!expense) return NextResponse.json({ success: false, message: "Expense not found" }, { status: 404 });

    expense.isDeleted = true;
    await expense.save();

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
