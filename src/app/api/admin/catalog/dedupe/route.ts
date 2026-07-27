/**
 * POST /api/admin/catalog/dedupe?businessId=... -- merges duplicate
 * Brand/Series/DeviceModel docs (same name, case-insensitive/trimmed,
 * within the same scope) for one business, keeping the oldest doc as the
 * survivor and reassigning every child reference before deleting the
 * duplicate. Runs Brand -> Series -> DeviceModel in that order since
 * Series/DeviceModel grouping depends on the final (post-merge) brandId.
 *
 * Same admin-triggered-catalog-maintenance shape as /api/admin/seed-catalog
 * (brands/create permission, businessId query param).
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import Brand from "@/models/Brand";
import Series from "@/models/Series";
import DeviceModel from "@/models/DeviceModel";
import Variant from "@/models/Variant";
import ServiceCenterBOM from "@/models/ServiceCenterBOM";
import CrmCall from "@/models/CrmCall";
import CrmJobSheet from "@/models/CrmJobSheet";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { logAction } from "@/lib/audit/logAction";

export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      requirePermission(session as any, buildPermissionCode("brands", "create"));
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const { searchParams } = new URL(req.url);
    const businessIdRaw = searchParams.get("businessId");
    if (!businessIdRaw || !Types.ObjectId.isValid(businessIdRaw)) {
      return NextResponse.json({ success: false, error: "Valid businessId is required" }, { status: 400 });
    }
    const businessId = new Types.ObjectId(businessIdRaw);

    await connectDB();

    let brandsMerged = 0;
    let seriesMerged = 0;
    let modelsMerged = 0;

    // --- Pass 1: Brand, grouped by {businessId, category, lower(name)} ---
    const brands = await Brand.find({ businessId }).sort({ createdAt: 1 }).lean();
    const brandGroups = new Map<string, any[]>();
    for (const b of brands) {
      const key = `${b.category || ""}::${(b.name || "").trim().toLowerCase()}`;
      if (!brandGroups.has(key)) brandGroups.set(key, []);
      brandGroups.get(key)!.push(b);
    }
    for (const group of brandGroups.values()) {
      if (group.length < 2) continue;
      const [survivor, ...dupes] = group; // oldest first (sorted by createdAt asc)
      for (const dupe of dupes) {
        await Series.updateMany({ brandId: dupe._id }, { $set: { brandId: survivor._id } });
        await DeviceModel.updateMany({ brandId: dupe._id }, { $set: { brandId: survivor._id } });
        // Live usage records that point at brandId directly (not just via
        // the catalog tree) would otherwise silently orphan onto a
        // deleted _id once the duplicate is removed below.
        await ServiceCenterBOM.updateMany({ brandId: dupe._id }, { $set: { brandId: survivor._id } });
        await CrmCall.updateMany({ brandId: dupe._id }, { $set: { brandId: survivor._id } });
        await CrmJobSheet.updateMany({ brandId: dupe._id }, { $set: { brandId: survivor._id } });
        await Brand.deleteOne({ _id: dupe._id });
        brandsMerged++;
      }
    }

    // --- Pass 2: Series, grouped by {businessId, brandId (post-merge), lower(name)} ---
    const seriesList = await Series.find({ businessId }).sort({ createdAt: 1 }).lean();
    const seriesGroups = new Map<string, any[]>();
    for (const s of seriesList) {
      const key = `${s.brandId}::${(s.name || "").trim().toLowerCase()}`;
      if (!seriesGroups.has(key)) seriesGroups.set(key, []);
      seriesGroups.get(key)!.push(s);
    }
    for (const group of seriesGroups.values()) {
      if (group.length < 2) continue;
      const [survivor, ...dupes] = group;
      for (const dupe of dupes) {
        await DeviceModel.updateMany({ seriesId: dupe._id }, { $set: { seriesId: survivor._id } });
        await ServiceCenterBOM.updateMany({ seriesId: dupe._id }, { $set: { seriesId: survivor._id } });
        await Series.deleteOne({ _id: dupe._id });
        seriesMerged++;
      }
    }

    // --- Pass 3: DeviceModel, grouped by {businessId, brandId (post-merge), lower(name)} ---
    const models = await DeviceModel.find({ businessId }).sort({ createdAt: 1 }).lean();
    const modelGroups = new Map<string, any[]>();
    for (const m of models) {
      const key = `${m.brandId}::${(m.name || "").trim().toLowerCase()}`;
      if (!modelGroups.has(key)) modelGroups.set(key, []);
      modelGroups.get(key)!.push(m);
    }
    for (const group of modelGroups.values()) {
      if (group.length < 2) continue;
      const [survivor, ...dupes] = group;
      for (const dupe of dupes) {
        await Variant.updateMany({ modelId: dupe._id }, { $set: { modelId: survivor._id } });
        await ServiceCenterBOM.updateMany({ deviceModelId: dupe._id }, { $set: { deviceModelId: survivor._id } });
        await CrmCall.updateMany({ deviceModelId: dupe._id }, { $set: { deviceModelId: survivor._id } });
        await CrmJobSheet.updateMany({ deviceModelId: dupe._id }, { $set: { deviceModelId: survivor._id } });
        await DeviceModel.deleteOne({ _id: dupe._id });
        modelsMerged++;
      }
    }

    const summary = { brandsMerged, seriesMerged, modelsMerged };

    logAction({
      action: "UPDATE",
      entity: "CatalogDedupe",
      entityId: businessIdRaw,
      after: summary,
      req,
      actor: { id: session.user.id },
    });

    return NextResponse.json({ success: true, summary });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
