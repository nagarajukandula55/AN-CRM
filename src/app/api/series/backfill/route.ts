/**
 * POST /api/series/backfill?businessId=... -- one-click fix for catalog data
 * that predates the Series level (every Brand created via the Brands page,
 * or via the original seed script before Series existed, has zero Series;
 * every DeviceModel created back then has no seriesId). Running the actual
 * migration/seed script requires direct database + shell access, which an
 * admin using only the web UI doesn't have -- this does the same two steps
 * (create a "General" Series for any Brand that has none, then set
 * seriesId on any DeviceModel that's missing one) from a button click.
 *
 * Idempotent and safe to run repeatedly: brands/models that already have a
 * Series are left untouched.
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import Brand from "@/models/Brand";
import Series from "@/models/Series";
import DeviceModel from "@/models/DeviceModel";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      requirePermission(session as any, buildPermissionCode("device_models", "create"));
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    if (!businessId || !Types.ObjectId.isValid(businessId)) {
      return NextResponse.json({ success: false, error: "Valid businessId is required" }, { status: 400 });
    }

    await connectDB();
    const businessObjectId = new Types.ObjectId(businessId);

    const brands = await Brand.find({ businessId: businessObjectId }).lean();

    let seriesCreated = 0;
    let modelsBackfilled = 0;

    for (const brand of brands) {
      let defaultSeries = await Series.findOne({ businessId: businessObjectId, brandId: brand._id }).sort({ createdAt: 1 });
      if (!defaultSeries) {
        defaultSeries = await Series.create({
          name: "General",
          brandId: brand._id,
          businessId: businessObjectId,
        });
        seriesCreated++;
      }

      const result = await DeviceModel.updateMany(
        { businessId: businessObjectId, brandId: brand._id, $or: [{ seriesId: null }, { seriesId: { $exists: false } }] },
        { $set: { seriesId: defaultSeries._id } }
      );
      modelsBackfilled += result.modifiedCount || 0;
    }

    return NextResponse.json({
      success: true,
      summary: { brandsScanned: brands.length, seriesCreated, modelsBackfilled },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
