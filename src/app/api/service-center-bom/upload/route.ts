/**
 * POST /api/service-center-bom/upload -- CSV bulk import of a vendor's
 * service-center BOM parts (multipart/form-data, field "file"). Follows the
 * same shape as /api/customers/upload (MIME/extension + 10MB size guard,
 * insertMany with ordered:false for partial-failure tolerance) but parses
 * with papaparse for real quoted-field CSV support, and resolves/auto-creates
 * Brand -> Series -> DeviceModel by name per row (case-insensitive, scoped
 * to this business) before building each ServiceCenterBOM doc.
 *
 * Expected columns: partName,brandName,seriesName,modelName,partType,unit,
 * hsnCode,gstRate,rate,warrantyDays,description
 * modelName is optional -- blank means the part applies to the whole
 * series/brand (deviceModelId left unset).
 */

import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { connectDB } from "@/lib/mongodb";
import mongoose from "mongoose";
import ServiceCenterBOM from "@/models/ServiceCenterBOM";
import VendorProfile from "@/models/VendorProfile";
import Brand from "@/models/Brand";
import Series from "@/models/Series";
import DeviceModel from "@/models/DeviceModel";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { logAction } from "@/lib/audit/logAction";
import { resolveOwnerOrManagerVendor } from "@/core/access/vendorAccess.service";

const PART_TYPES = ["SPARE_PART", "LABOUR", "CONSUMABLE"];

async function resolveVendorAndBusiness(userId: string, explicitVendorId?: string | null) {
  const vendor = await resolveOwnerOrManagerVendor(userId);
  if (vendor) {
    return { vendorId: (vendor as any)._id, businessId: (vendor as any).businessId };
  }
  if (explicitVendorId && mongoose.Types.ObjectId.isValid(explicitVendorId)) {
    const v = await VendorProfile.findOne({ _id: explicitVendorId, isDeleted: { $ne: true } }).lean();
    if (v) return { vendorId: (v as any)._id, businessId: (v as any).businessId };
  }
  return null;
}

// Case-insensitive find-or-create, scoped to businessId (+ brandId for
// Series/DeviceModel). Small in-request caches (by lowercased name) avoid
// re-querying/re-creating the same Brand/Series/Model on every row of a
// large CSV.
async function findOrCreateBrand(businessId: mongoose.Types.ObjectId, name: string, cache: Map<string, any>) {
  const key = name.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key);
  let brand: any = await Brand.findOne({ businessId, name: { $regex: `^${escapeRegex(name.trim())}$`, $options: "i" } }).lean();
  if (!brand) {
    brand = (await Brand.create({ businessId, name: name.trim() })).toObject();
  }
  cache.set(key, brand);
  return brand;
}

async function findOrCreateSeries(businessId: mongoose.Types.ObjectId, brandId: mongoose.Types.ObjectId, name: string, cache: Map<string, any>) {
  const key = `${brandId}:${name.trim().toLowerCase()}`;
  if (cache.has(key)) return cache.get(key);
  let series: any = await Series.findOne({ businessId, brandId, name: { $regex: `^${escapeRegex(name.trim())}$`, $options: "i" } }).lean();
  if (!series) {
    series = (await Series.create({ businessId, brandId, name: name.trim() })).toObject();
  }
  cache.set(key, series);
  return series;
}

async function findOrCreateModel(
  businessId: mongoose.Types.ObjectId,
  brandId: mongoose.Types.ObjectId,
  seriesId: mongoose.Types.ObjectId,
  name: string,
  cache: Map<string, any>
) {
  const key = `${brandId}:${name.trim().toLowerCase()}`;
  if (cache.has(key)) return cache.get(key);
  let model: any = await DeviceModel.findOne({ businessId, brandId, name: { $regex: `^${escapeRegex(name.trim())}$`, $options: "i" } }).lean();
  if (!model) {
    model = (await DeviceModel.create({ businessId, brandId, seriesId, name: name.trim() })).toObject();
  } else if (!(model as any).seriesId) {
    // Backfill a pre-existing model that predates the seriesId field.
    await DeviceModel.updateOne({ _id: (model as any)._id }, { $set: { seriesId } });
    (model as any).seriesId = seriesId;
  }
  cache.set(key, model);
  return model;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const explicitVendorId = formData.get("vendorId") as string | null;

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
    const resolved = await resolveVendorAndBusiness(session.user.id, explicitVendorId);
    if (!resolved) {
      return NextResponse.json({ success: false, error: "No vendor profile found for this account" }, { status: 403 });
    }

    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });

    const rows = parsed.data;
    if (!rows.length) {
      return NextResponse.json({ success: false, error: "No rows found in the file" }, { status: 400 });
    }

    const brandCache = new Map<string, any>();
    const seriesCache = new Map<string, any>();
    const modelCache = new Map<string, any>();

    // partCode is a running per business+vendor sequence, so allocation is
    // sequential (one row at a time) rather than batched.
    let nextSeq = (await ServiceCenterBOM.countDocuments({
      businessId: resolved.businessId,
      vendorId: resolved.vendorId,
    })) + 1;

    const results: Array<{ row: number; status: "created" | "error"; partCode?: string; error?: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2; // account for header row, 1-indexed for humans
      try {
        const partName = (r.partName || "").trim();
        const brandName = (r.brandName || "").trim();
        const seriesName = (r.seriesName || "").trim();
        const modelName = (r.modelName || "").trim();
        const hsnCode = (r.hsnCode || "").trim();
        const rate = r.rate !== undefined && r.rate !== "" ? Number(r.rate) : NaN;

        if (!partName) throw new Error("partName is required");
        if (!brandName) throw new Error("brandName is required");
        if (!seriesName) throw new Error("seriesName is required");
        if (!hsnCode) throw new Error("hsnCode is required");
        if (Number.isNaN(rate)) throw new Error("rate is required and must be a number");

        const brand = await findOrCreateBrand(resolved.businessId, brandName, brandCache);
        const series = await findOrCreateSeries(resolved.businessId, brand._id, seriesName, seriesCache);
        let deviceModelId: mongoose.Types.ObjectId | undefined;
        if (modelName) {
          const model = await findOrCreateModel(resolved.businessId, brand._id, series._id, modelName, modelCache);
          deviceModelId = model._id;
        }

        const partType = PART_TYPES.includes((r.partType || "").trim().toUpperCase())
          ? (r.partType || "").trim().toUpperCase()
          : "SPARE_PART";
        const gstRate = r.gstRate !== undefined && r.gstRate !== "" ? Number(r.gstRate) : 18;
        const warrantyDays = r.warrantyDays !== undefined && r.warrantyDays !== "" ? Number(r.warrantyDays) : undefined;

        const partCode = `PART-${String(nextSeq).padStart(4, "0")}`;
        nextSeq++;

        await ServiceCenterBOM.create({
          businessId: resolved.businessId,
          vendorId: resolved.vendorId,
          brandId: brand._id,
          seriesId: series._id,
          deviceModelId,
          partName,
          partCode,
          description: (r.description || "").trim() || undefined,
          partType,
          unit: (r.unit || "").trim() || "pcs",
          hsnCode,
          gstRate: Number.isNaN(gstRate) ? 18 : gstRate,
          rate,
          warrantyDays: warrantyDays !== undefined && !Number.isNaN(warrantyDays) ? warrantyDays : undefined,
        });

        results.push({ row: rowNum, status: "created", partCode });
      } catch (rowErr: unknown) {
        const message = rowErr instanceof Error ? rowErr.message : "Unknown error";
        results.push({ row: rowNum, status: "error", error: message });
      }
    }

    const created = results.filter((r) => r.status === "created").length;
    const failed = results.length - created;

    logAction({
      action: "CREATE",
      entity: "ServiceCenterBOM",
      entityId: "bulk-upload",
      after: { created, failed, sourceFileName: file.name },
      req,
      actor: { id: session.user.id },
    });

    return NextResponse.json({
      success: true,
      results,
      summary: { total: results.length, created, failed },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
