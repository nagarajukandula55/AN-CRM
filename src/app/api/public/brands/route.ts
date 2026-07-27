/**
 * GET /api/public/brands?businessId=...&category=... — PUBLIC. Read-only,
 * minimal-projection brand list for anonymous public forms (the
 * appointment-request page's Brand dropdown) — the real /api/brands
 * requires an authenticated session + brands.view permission, which a
 * public visitor never has, so that route always 401s here and silently
 * left the Brand dropdown empty (see appointment-request/page.tsx's
 * .catch(() => setBrands([]))). Same "never trust blindly" shape as
 * businesses/resolve-code: active-only, name/_id only, no create/edit/
 * delete, no permission-gated fields.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Brand from "@/models/Brand";
import { buildBusinessScopeQuery } from "@/core/catalog/businessScopeFilter";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    const category = searchParams.get("category");

    if (!businessId) {
      return NextResponse.json({ success: false, message: "businessId is required" }, { status: 400 });
    }

    await connectDB();

    const query: Record<string, unknown> = { ...buildBusinessScopeQuery(businessId), isActive: true };
    if (category) query.category = category;

    const brands = await Brand.find(query).select("name").sort({ name: 1 }).lean();

    return NextResponse.json({ success: true, brands });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
