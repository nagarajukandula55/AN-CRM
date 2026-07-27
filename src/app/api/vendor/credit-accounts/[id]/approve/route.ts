import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import CreditAccount from "@/models/CreditAccount";
import { resolveVendorContext } from "@/lib/auth/vendorContext";

/**
 * POST /api/vendor/credit-accounts/:id/approve — approves (or rejects) a
 * PENDING self-signup from the B2B portal, setting the credit terms the
 * vendor is actually willing to extend. body: { action: "APPROVE"|"REJECT",
 * creditLimit?, creditDays? } -- only meaningful on APPROVE.
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
    if (account.status !== "PENDING") {
      return NextResponse.json({ success: false, message: "Only a PENDING account can be approved/rejected" }, { status: 400 });
    }

    const body = await req.json();
    if (body.action === "REJECT") {
      account.status = "REJECTED";
    } else {
      account.status = "ACTIVE";
      if (body.creditLimit !== undefined) account.creditLimit = Number(body.creditLimit) || 0;
      if (body.creditDays !== undefined) account.creditDays = Number(body.creditDays) || 15;
    }
    await account.save();

    return NextResponse.json({ success: true, data: account });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
