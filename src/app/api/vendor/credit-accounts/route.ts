import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import CreditAccount from "@/models/CreditAccount";
import { resolveVendorContext } from "@/lib/auth/vendorContext";
import { getDaysOverdue } from "@/core/credit/creditLedger";

// GET /api/vendor/credit-accounts — this vendor's Distributor/Retailer
// credit accounts (including PENDING self-signups awaiting approval), for
// the /vendor/credits page.
export async function GET() {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    await connectDB();
    const ctx = await resolveVendorContext(userId);
    if (!ctx) return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });
    const vendor = ctx.vendor as any;

    const accounts = await CreditAccount.find({ vendorId: vendor._id }).sort({ name: 1 }).lean();
    const withAging = await Promise.all(
      accounts.map(async (a: any) => ({ ...a, daysOverdue: await getDaysOverdue(String(a._id)) }))
    );
    return NextResponse.json({ success: true, data: withAging });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// POST /api/vendor/credit-accounts — create a new Distributor/Retailer
// credit account directly (starts ACTIVE -- the vendor already knows and
// trusts them, unlike a public self-signup which starts PENDING).
export async function POST(req: NextRequest) {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    await connectDB();
    const ctx = await resolveVendorContext(userId);
    if (!ctx) return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });
    const vendor = ctx.vendor as any;
    if (!vendor.businessId) return NextResponse.json({ success: false, message: "Vendor has no business assigned" }, { status: 400 });

    const body = await req.json();
    const name = String(body.name || "").trim();
    const type = body.type === "DISTRIBUTOR" ? "DISTRIBUTOR" : body.type === "RETAILER" ? "RETAILER" : null;
    if (!name) return NextResponse.json({ success: false, message: "Account name is required" }, { status: 400 });
    if (!type) return NextResponse.json({ success: false, message: "Type must be DISTRIBUTOR or RETAILER" }, { status: 400 });

    const account = await CreditAccount.create({
      businessId: vendor.businessId,
      vendorId: vendor._id,
      name,
      type,
      status: "ACTIVE",
      contactPerson: body.contactPerson || undefined,
      phone: body.phone || undefined,
      email: body.email || undefined,
      creditLimit: Number(body.creditLimit) || 0,
      creditDays: body.creditDays !== undefined ? Number(body.creditDays) : 15,
      notes: body.notes || undefined,
    });

    return NextResponse.json({ success: true, data: account });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
