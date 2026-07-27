import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import VendorSubscription from "@/models/VendorSubscription";
import VendorBillingInvoice from "@/models/VendorBillingInvoice";
import { resolveVendorContext } from "@/lib/auth/vendorContext";
import { computeStatus } from "@/core/billing/billing.service";

// GET /api/vendor/billing — the logged-in vendor's own plan + invoice history.
export async function GET(_req: NextRequest) {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    await connectDB();
    const ctx = await resolveVendorContext(userId);
    if (!ctx) return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });

    const vendor = ctx.vendor as any;
    const subscription = await VendorSubscription.findOne({ vendorId: vendor._id }).lean();
    const invoices = await VendorBillingInvoice.find({ vendorId: vendor._id }).sort({ createdAt: -1 }).lean();

    return NextResponse.json({
      success: true,
      subscription,
      status: computeStatus(subscription as any),
      invoices,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
