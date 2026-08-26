/**
 * GET/PATCH /api/vendor/settings — PER-VENDOR operational settings an
 * Owner or Manager (not any other staff role) can see/change themselves,
 * without needing Super Admin:
 *  - inventorySerialized -- whether workorder part selection checks real
 *    Inventory stock or just pulls from the Service Center BOM price list.
 *  - termsAndConditions -- fallback free text shown on any document type
 *    that has no MORE SPECIFIC terms of its own set below.
 *  - workorderTerms / serviceOrderTerms / estimateTerms / invoiceTerms --
 *    per-document-type T&C, same shape as Business's own identically-named
 *    fields (see core/documentTemplates/adapters.ts's termsForDocType).
 *    Was previously one unified field shown on every document type;
 *    reported live ("Should be separate per page type not same for all").
 *  - defaultLabourCharge -- fallback rate for the workorder page's
 *    "Add Labour Charge" line when no LABOUR-type BOM entry is configured.
 *  - customerLogoUrl -- shown on the Intake Receipt/Workorder print in
 *    place of the device brand's own logo (blank = no logo at all).
 *  - documentSignatureUrl -- signature image on printed documents.
 *  - applyTaxOnB2CBilling -- whether GST/tax is applied when a job sheet
 *    closes into a plain B2C bill (no company name on the customer). B2B
 *    invoices (company name present) always carry tax regardless of this
 *    toggle -- see api/crm/jobsheets/[id]/close/route.ts.
 *  - upiId -- this vendor's own UPI ID for the payment QR on their
 *    invoices (see api/sales/invoices/[id]/upi-qr/route.ts).
 *
 * Stored on VendorProfile, NOT Business -- every self-signed-up vendor
 * shares one platform Business document (see api/vendors/self-signup/
 * route.ts), so storing these here instead means one vendor's saved
 * settings can never leak into or overwrite another's. Reported live
 * ("in operations tab for new vendor also all terms and conditions,
 * service charges, upi id, everything coming what i set for my vendor").
 */
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import VendorProfile from "@/models/VendorProfile";
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

    const v = vendor as any;
    return NextResponse.json({
      success: true,
      inventorySerialized: Boolean(v.inventorySerialized),
      termsAndConditions: v.termsAndConditions || "",
      workorderTerms: v.workorderTerms || "",
      serviceOrderTerms: v.serviceOrderTerms || "",
      estimateTerms: v.estimateTerms || "",
      invoiceTerms: v.invoiceTerms || "",
      defaultLabourCharge: Number(v.defaultLabourCharge) || 0,
      customerLogoUrl: v.customerLogoUrl || "",
      documentSignatureUrl: v.documentSignatureUrl || "",
      applyTaxOnB2CBilling: v.applyTaxOnB2CBilling !== false,
      upiId: v.upiId || "",
      bankAccountName: v.bankAccountName || "",
      bankAccountNumber: v.bankAccountNumber || "",
      bankIFSC: v.bankIFSC || "",
      bankName: v.bankName || "",
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

    const body = await req.json().catch(() => ({}));
    const update: Record<string, unknown> = {};
    if (typeof body.inventorySerialized === "boolean") update.inventorySerialized = body.inventorySerialized;
    if (typeof body.termsAndConditions === "string") update.termsAndConditions = body.termsAndConditions;
    if (typeof body.workorderTerms === "string") update.workorderTerms = body.workorderTerms;
    if (typeof body.serviceOrderTerms === "string") update.serviceOrderTerms = body.serviceOrderTerms;
    if (typeof body.estimateTerms === "string") update.estimateTerms = body.estimateTerms;
    if (typeof body.invoiceTerms === "string") update.invoiceTerms = body.invoiceTerms;
    if (typeof body.defaultLabourCharge === "number" && body.defaultLabourCharge >= 0) update.defaultLabourCharge = body.defaultLabourCharge;
    if (typeof body.customerLogoUrl === "string") update.customerLogoUrl = body.customerLogoUrl;
    if (typeof body.documentSignatureUrl === "string") update.documentSignatureUrl = body.documentSignatureUrl;
    if (typeof body.applyTaxOnB2CBilling === "boolean") update.applyTaxOnB2CBilling = body.applyTaxOnB2CBilling;
    if (typeof body.upiId === "string") update.upiId = body.upiId;
    if (typeof body.bankAccountName === "string") update.bankAccountName = body.bankAccountName;
    if (typeof body.bankAccountNumber === "string") update.bankAccountNumber = body.bankAccountNumber;
    if (typeof body.bankIFSC === "string") update.bankIFSC = body.bankIFSC;
    if (typeof body.bankName === "string") update.bankName = body.bankName;
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ success: false, error: "Nothing to update" }, { status: 400 });
    }

    await VendorProfile.updateOne({ _id: (vendor as any)._id }, { $set: update });

    return NextResponse.json({ success: true, ...update });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
