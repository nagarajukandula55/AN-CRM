/**
 * GET /api/public/device-models?businessId=...&brandId=... — PUBLIC.
 * Read-only, minimal-projection model list for anonymous public forms (the
 * appointment-request page's Model dropdown) — mirrors
 * /api/public/brands/route.ts's reasoning: the real /api/device-models
 * requires an authenticated session + device_models.view permission, which
 * a public visitor never has.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import DeviceModel from "@/models/DeviceModel";
import { buildBusinessScopeQuery } from "@/core/catalog/businessScopeFilter";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    const brandId = searchParams.get("brandId");

    if (!businessId) {
      return NextResponse.json({ success: false, message: "businessId is required" }, { status: 400 });
    }
    if (!brandId) {
      return NextResponse.json({ success: false, message: "brandId is required" }, { status: 400 });
    }

    await connectDB();

    const query: Record<string, unknown> = { ...buildBusinessScopeQuery(businessId), isActive: true, brandId };

    const models = await DeviceModel.find(query).select("name").sort({ name: 1 }).lean();

    return NextResponse.json({ success: true, models });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
