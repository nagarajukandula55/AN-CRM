import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Business from "@/models/Business";
import Warehouse from "@/models/Warehouse";
import { getTemplateForBusiness } from "@/core/documentTemplates/resolve";
import { businessToCompany } from "@/core/documentTemplates/adapters";
import type { DocumentTemplateType } from "@/models/DocumentTemplate";

/**
 * GET /api/document-templates/resolve?businessId=&documentType=&warehouseId=
 * Returns the resolved template (blocks/accentColor/logoUrl, saved default
 * or built-in fallback) plus the ready-to-use `company` render block for
 * that business (with the service-center logo override applied if
 * warehouseId is given) — everything a print page needs in one call.
 */
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
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
      Business.findById(businessId).lean(),
      warehouseId ? Warehouse.findById(warehouseId).lean() : Promise.resolve(null),
    ]);

    return NextResponse.json({
      success: true,
      template,
      company: businessToCompany(business, warehouse),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
