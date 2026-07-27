import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Business from "@/models/Business";
import { Types } from "mongoose";

/**
 * GET /api/businesses/public?businessId=... — PUBLIC, minimal lookup so the
 * vendor application form can show which business the vendor is applying to.
 * Exposes only the display name — nothing sensitive.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");

    if (!businessId || !Types.ObjectId.isValid(businessId)) {
      return NextResponse.json(
        { success: false, message: "Invalid business link" },
        { status: 400 }
      );
    }

    await connectDB();
    const business = await (Business as any)
      .findOne({ _id: businessId, isActive: true })
      .select("name brandName logo favicon industry vendorDocumentRequirements")
      .lean();

    if (!business) {
      return NextResponse.json(
        { success: false, message: "Business not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      business: {
        name: business.brandName || business.name,
        logo: business.logo || null,
        favicon: business.favicon || null,
        // Needed by /vendor-apply to know which industry-specific
        // compliance documents (FSSAI, Drug License, etc.) to ask this
        // applicant for — see core/vendorCompliance.ts. Still nothing
        // sensitive: just the industry category.
        industry: business.industry || null,
        vendorDocumentRequirements: business.vendorDocumentRequirements || [],
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Internal Server Error" },
      { status: 500 }
    );
  }
}
