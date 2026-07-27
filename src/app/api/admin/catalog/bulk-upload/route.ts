/**
 * POST /api/admin/catalog/bulk-upload?businessId=... -- CSV bulk import of
 * the Category -> Brand -> Series -> Model -> Variant catalog tree
 * (multipart/form-data, field "file"). Same pattern as
 * /api/service-center-bom/upload: papaparse for real quoted-field CSV
 * support, MIME/size guard, case-insensitive find-or-create per row with an
 * in-request cache Map, row-by-row processing with a results array.
 *
 * Expected columns: category,brand,series,model,variant
 * - category: one of the 45 DEVICE_CATEGORIES keys, or a DEVICE_CATEGORY_LABELS
 *   label, matched case-insensitively.
 * - brand: required.
 * - series/model/variant: all optional. Blank series means the model
 *   attaches directly to the brand. Blank model means only brand/series get
 *   created from this row. Blank variant means no variant.
 */

import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { connectDB } from "@/lib/mongodb";
import mongoose, { Types } from "mongoose";
import Brand from "@/models/Brand";
import Series from "@/models/Series";
import DeviceModel from "@/models/DeviceModel";
import Variant from "@/models/Variant";
import { DEVICE_CATEGORIES, DEVICE_CATEGORY_LABELS, type DeviceCategory } from "@/core/catalog/deviceCategory";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { logAction } from "@/lib/audit/logAction";

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveCategory(raw: string): DeviceCategory | null {
  const val = raw.trim();
  if (!val) return null;
  const upper = val.toUpperCase().replace(/\s+/g, "_");
  if ((DEVICE_CATEGORIES as readonly string[]).includes(upper)) {
    return upper as DeviceCategory;
  }
  const lower = val.toLowerCase();
  const match = (Object.keys(DEVICE_CATEGORY_LABELS) as DeviceCategory[]).find(
    (key) => DEVICE_CATEGORY_LABELS[key].toLowerCase() === lower
  );
  return match || null;
}

async function findOrCreateBrand(
  businessId: mongoose.Types.ObjectId,
  category: DeviceCategory,
  name: string,
  cache: Map<string, { doc: any; created: boolean }>
) {
  const key = `${category}:${name.trim().toLowerCase()}`;
  if (cache.has(key)) return cache.get(key)!;
  let doc: any = await Brand.findOne({
    businessId,
    category,
    name: { $regex: `^${escapeRegex(name.trim())}$`, $options: "i" },
  }).lean();
  let created = false;
  if (!doc) {
    doc = (await Brand.create({ businessId, category, name: name.trim() })).toObject();
    created = true;
  }
  const entry = { doc, created };
  cache.set(key, entry);
  return entry;
}

async function findOrCreateSeries(
  businessId: mongoose.Types.ObjectId,
  brandId: mongoose.Types.ObjectId,
  name: string,
  cache: Map<string, { doc: any; created: boolean }>
) {
  const key = `${brandId}:${name.trim().toLowerCase()}`;
  if (cache.has(key)) return cache.get(key)!;
  let doc: any = await Series.findOne({
    businessId,
    brandId,
    name: { $regex: `^${escapeRegex(name.trim())}$`, $options: "i" },
  }).lean();
  let created = false;
  if (!doc) {
    doc = (await Series.create({ businessId, brandId, name: name.trim() })).toObject();
    created = true;
  }
  const entry = { doc, created };
  cache.set(key, entry);
  return entry;
}

async function findOrCreateModel(
  businessId: mongoose.Types.ObjectId,
  brandId: mongoose.Types.ObjectId,
  seriesId: mongoose.Types.ObjectId | null,
  name: string,
  cache: Map<string, { doc: any; created: boolean }>
) {
  const key = `${brandId}:${name.trim().toLowerCase()}`;
  if (cache.has(key)) return cache.get(key)!;
  let doc: any = await DeviceModel.findOne({
    businessId,
    brandId,
    name: { $regex: `^${escapeRegex(name.trim())}$`, $options: "i" },
  }).lean();
  let created = false;
  if (!doc) {
    doc = (await DeviceModel.create({ businessId, brandId, seriesId: seriesId || null, name: name.trim() })).toObject();
    created = true;
  }
  const entry = { doc, created };
  cache.set(key, entry);
  return entry;
}

async function findOrCreateVariant(
  businessId: mongoose.Types.ObjectId,
  modelId: mongoose.Types.ObjectId,
  name: string,
  cache: Map<string, { doc: any; created: boolean }>
) {
  const key = `${modelId}:${name.trim().toLowerCase()}`;
  if (cache.has(key)) return cache.get(key)!;
  let doc: any = await Variant.findOne({
    businessId,
    modelId,
    name: { $regex: `^${escapeRegex(name.trim())}$`, $options: "i" },
  }).lean();
  let created = false;
  if (!doc) {
    doc = (await Variant.create({ businessId, modelId, name: name.trim() })).toObject();
    created = true;
  }
  const entry = { doc, created };
  cache.set(key, entry);
  return entry;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
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

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: "No file uploaded" }, { status: 400 });
    }
    const isCsv = file.type === "text/csv" || file.type === "application/vnd.ms-excel" || file.name.toLowerCase().endsWith(".csv");
    if (!isCsv) {
      return NextResponse.json({ success: false, error: "Please upload a .csv file" }, { status: 400 });
    }
    const MAX_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ success: false, error: "File is too large (max 10MB)" }, { status: 400 });
    }

    await connectDB();

    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
    });

    const rows = parsed.data;
    if (!rows.length) {
      return NextResponse.json({ success: false, error: "No rows found in the file" }, { status: 400 });
    }

    const brandCache = new Map<string, { doc: any; created: boolean }>();
    const seriesCache = new Map<string, { doc: any; created: boolean }>();
    const modelCache = new Map<string, { doc: any; created: boolean }>();
    const variantCache = new Map<string, { doc: any; created: boolean }>();

    const results: Array<{ row: number; status: "created" | "skipped" | "failed"; error?: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2;
      try {
        const categoryRaw = (r.category || "").trim();
        const brandName = (r.brand || "").trim();
        const seriesName = (r.series || "").trim();
        const modelName = (r.model || "").trim();
        const variantName = (r.variant || "").trim();

        if (!categoryRaw) throw new Error("category is required");
        if (!brandName) throw new Error("brand is required");

        const category = resolveCategory(categoryRaw);
        if (!category) {
          throw new Error(`Unrecognized category "${categoryRaw}" -- must match a DEVICE_CATEGORIES key or label`);
        }

        let anyCreated = false;

        const { doc: brand, created: brandCreated } = await findOrCreateBrand(businessId, category, brandName, brandCache);
        anyCreated = anyCreated || brandCreated;

        let seriesId: mongoose.Types.ObjectId | null = null;
        if (seriesName) {
          const { doc: series, created: seriesCreated } = await findOrCreateSeries(businessId, brand._id, seriesName, seriesCache);
          seriesId = series._id;
          anyCreated = anyCreated || seriesCreated;
        }

        let modelDoc: any = null;
        if (modelName) {
          const { doc: model, created: modelCreated } = await findOrCreateModel(businessId, brand._id, seriesId, modelName, modelCache);
          modelDoc = model;
          anyCreated = anyCreated || modelCreated;
        }

        if (variantName) {
          if (!modelDoc) {
            throw new Error("variant given but model is blank -- a variant requires a model");
          }
          const { created: variantCreated } = await findOrCreateVariant(businessId, modelDoc._id, variantName, variantCache);
          anyCreated = anyCreated || variantCreated;
        }

        results.push({ row: rowNum, status: anyCreated ? "created" : "skipped" });
      } catch (rowErr: unknown) {
        const message = rowErr instanceof Error ? rowErr.message : "Unknown error";
        results.push({ row: rowNum, status: "failed", error: message });
      }
    }

    const created = results.filter((r) => r.status === "created").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    const failed = results.filter((r) => r.status === "failed").length;

    logAction({
      action: "CREATE",
      entity: "CatalogBulkUpload",
      entityId: "bulk-upload",
      after: { created, skipped, failed, sourceFileName: file.name },
      req,
      actor: { id: session.user.id },
    });

    return NextResponse.json({
      success: true,
      results,
      summary: { total: results.length, created, skipped, failed },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
