/**
 * GET /api/businesses/resolve-code?code=AB — PUBLIC. Resolves a business's
 * 2-character brandShortcut to its real businessId, so public links (e.g. the
 * customer appointment-request page) can use `?code=AB` instead of a full
 * ObjectId. Same "never trust blindly" shape as businesses/public — only
 * returns the id for an active business.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Business from "@/models/Business";

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const code = (searchParams.get("code") || "").trim().toUpperCase();
    if (code.length !== 2) {
      return NextResponse.json({ success: false, message: "Invalid code" }, { status: 400 });
    }

    const business = await Business.findOne({ brandShortcut: code, isActive: true })
      .select("_id name brandName")
      .lean();
    if (!business) {
      return NextResponse.json({ success: false, message: "No business found for this code" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      businessId: String((business as any)._id),
      name: (business as any).brandName || (business as any).name,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message || "Internal Server Error" }, { status: 500 });
  }
}
