import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Warehouse from "@/models/Warehouse";
import { getBusinessBySourceId } from "@/lib/centralApiRead";
import { getTemplateForBusiness } from "@/core/documentTemplates/resolve";
import { businessToCompany } from "@/core/documentTemplates/adapters";
import type { DocumentTemplateType } from "@/models/DocumentTemplate";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { resolveAuthorizedBusinessId } from "@/lib/auth/resolveAuthorizedBusinessId";

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

    if (!businessId || !documentType) {
      return NextResponse.json(
        { success: false, error: "businessId and documentType are required" },
        { status: 400 }
      );
    }

    const [template, business, warehouse] = await Promise.all([
      getTemplateForBusiness(businessId, documentType),
      getBusinessBySourceId(businessId), // reads from central-api — see src/lib/centralApiRead.ts
      warehouseId ? Warehouse.findById(warehouseId).lean() : Promise.resolve(null),
    ]);

    return NextResponse.json({
      success: true,
      template,
      company: businessToCompany(business, warehouse, documentType),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
