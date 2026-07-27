import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import VendorProfile from "@/models/VendorProfile";
import VendorSubscription from "@/models/VendorSubscription";
import VendorBillingInvoice from "@/models/VendorBillingInvoice";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { computeStatus, totalAmount } from "@/core/billing/billing.service";
import { VENDOR_MODULE_KEYS } from "@/core/access/vendorAccess.service";

async function requireSuperAdmin() {
  const session = await getEnrichedSession();
  if (!session?.user || !session.isSuperAdmin) return null;
  return session;
}

// GET /api/admin/vendor-billing/:vendorId — this vendor's plan + invoice history.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ vendorId: string }> }) {
  try {
    const session = await requireSuperAdmin();
    if (!session) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });

    const { vendorId } = await params;
    await connectDB();

    const vendor = await VendorProfile.findById(vendorId).select("vendorId companyName businessId").lean();
    if (!vendor) return NextResponse.json({ success: false, message: "Vendor not found" }, { status: 404 });

    const subscription = await VendorSubscription.findOne({ vendorId }).lean();
    const invoices = await VendorBillingInvoice.find({ vendorId }).sort({ createdAt: -1 }).lean();

    return NextResponse.json({
      success: true,
      vendor,
      subscription,
      status: computeStatus(subscription as any),
      moduleKeys: VENDOR_MODULE_KEYS,
      invoices,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// PUT /api/admin/vendor-billing/:vendorId — set/update this vendor's
// per-module pricing and billing-cycle length. Does NOT touch the current
// paid-through period — that only moves when an invoice is paid (see
// invoice/route.ts + vendor/billing/invoices/[id]/confirm/route.ts) — so
// changing price mid-cycle never grants or revokes access by itself.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ vendorId: string }> }) {
  try {
    const session = await requireSuperAdmin();
    if (!session) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });

    const { vendorId } = await params;
    const body = await req.json();
    const modules = Array.isArray(body.modules) ? body.modules : [];
    const validityDays = Number(body.validityDays) || 30;

    for (const m of modules) {
      if (!VENDOR_MODULE_KEYS.includes(m.key)) {
        return NextResponse.json({ success: false, message: `Unknown module: ${m.key}` }, { status: 400 });
      }
      if (typeof m.rate !== "number" || m.rate < 0) {
        return NextResponse.json({ success: false, message: `Invalid rate for ${m.key}` }, { status: 400 });
      }
    }

    await connectDB();
    const vendor = await VendorProfile.findById(vendorId).select("businessId").lean();
    if (!vendor) return NextResponse.json({ success: false, message: "Vendor not found" }, { status: 404 });

    const subscription = await VendorSubscription.findOneAndUpdate(
      { vendorId },
      { $set: { businessId: (vendor as any).businessId, modules, validityDays } },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true, subscription, amount: totalAmount(modules) });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
