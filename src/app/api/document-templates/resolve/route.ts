import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Warehouse from "@/models/Warehouse";
import Business from "@/models/Business";
import VendorProfile from "@/models/VendorProfile";
import { getBusinessBySourceId } from "@/lib/centralApiRead";
import { getTemplateForBusiness } from "@/core/documentTemplates/resolve";
import { businessToCompany } from "@/core/documentTemplates/adapters";
import type { DocumentTemplateType } from "@/models/DocumentTemplate";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { resolveAuthorizedBusinessId } from "@/lib/auth/resolveAuthorizedBusinessId";

// Terms & Conditions (and signature/bank details) are saved from Settings
// straight to THIS app's own local Business document -- they're AN-CRM-
// specific fields central-api's shared "businesses" dataset never had, so
// reading company info from central-api ONLY (as this route otherwise
// correctly does, for cross-product consistency on name/address/GSTIN)
// meant Terms & Conditions could never show on any printed document
// regardless of what was saved in Settings. Overlaid from the local
// document here -- the actual, root-cause fix for that report.
const LOCAL_ONLY_FIELDS =
  "workorderTerms serviceOrderTerms estimateTerms invoiceTerms termsAndConditions documentSignatureUrl";

/**
 * GET /api/document-templates/resolve?businessId=&documentType=&warehouseId=
 * Returns the resolved template (blocks/accentColor/logoUrl, saved default
 * or built-in fallback) plus the ready-to-use `company` render block for
 * that business (with the service-center logo override applied if
 * warehouseId is given) — everything a print page needs in one call.
 */
export async function GET(req: NextRequest) {
  try {
    // SECURITY: had no auth check at all -- leaked a business's address/
    // GSTIN (via businessToCompany) to any caller who knew its businessId.
    // Every consumer of this route is an authenticated console/print
    // page, so this was never meant to be publicly reachable.
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    await connectDB();
    const { searchParams } = new URL(req.url);
    const businessId = await resolveAuthorizedBusinessId(
      session.user.id,
      searchParams.get("businessId"),
      session.isSuperAdmin,
      session.business?.businessId || null
    );
    const documentType = searchParams.get("documentType") as DocumentTemplateType | null;
    const warehouseId = searchParams.get("warehouseId");
    // Which vendor actually issued this specific document -- see
    // businessToCompany's own comment on why this now overrides the
    // shared Business identity when set. Optional: callers that don't
    // have a vendorId (e.g. a purely business-level document) keep
    // getting the Business identity exactly as before.
    const vendorId = searchParams.get("vendorId");

    if (!businessId || !documentType) {
      return NextResponse.json(
        { success: false, error: "businessId and documentType are required" },
        { status: 400 }
      );
    }

    const [template, business, localBusiness, warehouse, vendor] = await Promise.all([
      getTemplateForBusiness(businessId, documentType),
      getBusinessBySourceId(businessId), // reads from central-api — see src/lib/centralApiRead.ts
      Business.findById(businessId).select(LOCAL_ONLY_FIELDS).lean(),
      warehouseId ? Warehouse.findById(warehouseId).lean() : Promise.resolve(null),
      vendorId ? VendorProfile.findById(vendorId).select("companyName phone address gstNumber").lean() : Promise.resolve(null),
    ]);

    const mergedBusiness = { ...(business || {}), ...(localBusiness || {}) };

    return NextResponse.json({
      success: true,
      template,
      company: businessToCompany(mergedBusiness, warehouse, documentType, vendor),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
