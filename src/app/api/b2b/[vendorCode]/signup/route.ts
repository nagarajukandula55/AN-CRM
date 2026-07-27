import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import VendorProfile from "@/models/VendorProfile";
import CreditAccount from "@/models/CreditAccount";
import { hashPassword } from "@/lib/auth/password";

// POST /api/b2b/:vendorCode/signup — public self-signup for a Distributor/
// Retailer. Always creates the account as PENDING -- credit terms
// (limit/days) are only ever set by the vendor's own Approve action (see
// /api/vendor/credit-accounts/:id/approve), never by the signer themselves.
export async function POST(req: NextRequest, { params }: { params: Promise<{ vendorCode: string }> }) {
  try {
    const { vendorCode } = await params;
    await connectDB();

    const vendor = await VendorProfile.findOne({ vendorId: vendorCode }).select("_id businessId enableB2BOrdering");
    if (!vendor || !(vendor as any).enableB2BOrdering) {
      return NextResponse.json({ success: false, message: "B2B ordering isn't available for this vendor." }, { status: 404 });
    }

    const body = await req.json();
    const name = String(body.name || "").trim();
    const type = body.type === "DISTRIBUTOR" ? "DISTRIBUTOR" : body.type === "RETAILER" ? "RETAILER" : null;
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!name) return NextResponse.json({ success: false, message: "Business name is required" }, { status: 400 });
    if (!type) return NextResponse.json({ success: false, message: "Select whether you're a Distributor or Retailer" }, { status: 400 });
    if (!email) return NextResponse.json({ success: false, message: "Email is required" }, { status: 400 });
    if (!password || password.length < 6) return NextResponse.json({ success: false, message: "Password must be at least 6 characters" }, { status: 400 });

    const existing = await CreditAccount.findOne({ vendorId: vendor._id, email });
    if (existing) {
      return NextResponse.json({ success: false, message: "An account with this email already exists for this vendor." }, { status: 409 });
    }

    const account = await CreditAccount.create({
      businessId: (vendor as any).businessId,
      vendorId: vendor._id,
      name,
      type,
      email,
      passwordHash: await hashPassword(password),
      status: "PENDING",
      contactPerson: body.contactPerson || undefined,
      phone: body.phone || undefined,
    });

    return NextResponse.json({
      success: true,
      message: "Signup received — the vendor will review and approve your account before you can order.",
      accountId: account._id,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
