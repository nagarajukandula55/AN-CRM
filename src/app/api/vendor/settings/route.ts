/**
 * GET/PATCH /api/vendor/settings — business-level settings a vendor
 * Owner or Manager (not any other staff role) can see/change themselves,
 * without needing Super Admin:
 *  - inventorySerialized -- whether workorder part selection checks real
 *    Inventory stock or just pulls from the Service Center BOM price list.
 *  - termsAndConditions -- free text shown on this business's workorder,
 *    estimate and invoice pages/prints.
 *  - defaultLabourCharge -- fallback rate for the workorder page's
 *    "Add Labour Charge" line when no LABOUR-type BOM entry is configured.
 *  - customerLogoUrl -- shown on the Intake Receipt/Workorder print in
 *    place of the device brand's own logo (blank = no logo at all).
 *  - applyTaxOnB2CBilling -- whether GST/tax is applied when a job sheet
 *    closes into a plain B2C bill (no company name on the customer). B2B
 *    invoices (company name present) always carry tax regardless of this
 *    toggle -- see api/crm/jobsheets/[id]/close/route.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import Business from "@/models/Business";
// ONE shared Owner-or-Manager definition for every vendor management
// surface (settings, team access, portal nav) -- see
// core/access/vendorAccess.service.ts.
import { resolveOwnerOrManagerVendor } from "@/core/access/vendorAccess.service";

export async function GET() {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    const vendor = await resolveOwnerOrManagerVendor(userId);
    if (!vendor) {
      return NextResponse.json({ success: false, error: "Only a vendor Owner or Manager can view these settings" }, { status: 403 });
    }
    if (!(vendor as any).businessId) {
      return NextResponse.json({ success: false, error: "Vendor is not yet assigned to a business" }, { status: 400 });
    }

    const business = await Business.findById((vendor as any).businessId).select("inventorySerialized termsAndConditions defaultLabourCharge customerLogoUrl documentSignatureUrl applyTaxOnB2CBilling").lean();
    return NextResponse.json({
      success: true,
      inventorySerialized: Boolean((business as any)?.inventorySerialized),
      termsAndConditions: (business as any)?.termsAndConditions || "",
      defaultLabourCharge: Number((business as any)?.defaultLabourCharge) || 0,
      customerLogoUrl: (business as any)?.customerLogoUrl || "",
      documentSignatureUrl: (business as any)?.documentSignatureUrl || "",
      applyTaxOnB2CBilling: (business as any)?.applyTaxOnB2CBilling !== false,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    const vendor = await resolveOwnerOrManagerVendor(userId);
    if (!vendor) {
      return NextResponse.json({ success: false, error: "Only a vendor Owner or Manager can change these settings" }, { status: 403 });
    }
    if (!(vendor as any).businessId) {
      return NextResponse.json({ success: false, error: "Vendor is not yet assigned to a business" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const update: Record<string, unknown> = {};
    if (typeof body.inventorySerialized === "boolean") update.inventorySerialized = body.inventorySerialized;
    if (typeof body.termsAndConditions === "string") update.termsAndConditions = body.termsAndConditions;
    if (typeof body.defaultLabourCharge === "number" && body.defaultLabourCharge >= 0) update.defaultLabourCharge = body.defaultLabourCharge;
    if (typeof body.customerLogoUrl === "string") update.customerLogoUrl = body.customerLogoUrl;
    if (typeof body.documentSignatureUrl === "string") update.documentSignatureUrl = body.documentSignatureUrl;
    if (typeof body.applyTaxOnB2CBilling === "boolean") update.applyTaxOnB2CBilling = body.applyTaxOnB2CBilling;
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ success: false, error: "Nothing to update" }, { status: 400 });
    }

    await Business.updateOne({ _id: (vendor as any).businessId }, { $set: update });

    return NextResponse.json({ success: true, ...update });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
