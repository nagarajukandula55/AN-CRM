/**
 * GET  /api/hsn-tax-rates?businessId=...&hsnCode=...
 * POST /api/hsn-tax-rates  { businessId, hsnCode, gstRate, category?, description? }
 * Simple HSN -> GST rate lookup used by the Workorder line-item UI to
 * auto-fill tax% when a part is picked by its HSN code. Auto-seeds
 * DEFAULT_HSN_TAX_RATES (global) on first call if nothing exists yet.
 * POST creates a business-specific override (businessId required -- the
 * global/default rows are platform-seeded, not editable here).
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import HsnTaxRate, { DEFAULT_HSN_TAX_RATES } from "@/models/HsnTaxRate";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { logAction } from "@/lib/audit/logAction";

function permissionErrorResponse(err: any) {
  return NextResponse.json(
    { success: false, error: err.message },
    { status: err.code === "FORBIDDEN" ? 403 : 401 }
  );
}

async function ensureSeeded() {
  // Per-code upsert rather than "insert all if the collection is empty" --
  // that all-or-nothing check meant a business created before food HSN
  // codes were added to DEFAULT_HSN_TAX_RATES would never receive them
  // (the collection was already non-empty from the electronics-only set),
  // permanently stuck showing "no matching HSN rate found" for anything
  // added to the default list afterward.
  const existingCodes = new Set(
    (await HsnTaxRate.find({ businessId: null }).select("hsnCode").lean()).map((r: any) => r.hsnCode)
  );
  const missing = DEFAULT_HSN_TAX_RATES.filter((r) => !existingCodes.has(r.hsnCode));
  if (missing.length) {
    await HsnTaxRate.insertMany(missing.map((r) => ({ ...r, businessId: null })));
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    await ensureSeeded();

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    const hsnCode = searchParams.get("hsnCode");

    const query: Record<string, unknown> = {};
    if (businessId && Types.ObjectId.isValid(businessId)) {
      query.$or = [{ businessId: new Types.ObjectId(businessId) }, { businessId: null }];
    }
    if (hsnCode) query.hsnCode = hsnCode.trim();

    const rates = await HsnTaxRate.find(query).sort({ hsnCode: 1 }).lean();

    // If a specific hsnCode was requested, prefer a business-specific
    // override over the global default when both exist.
    if (hsnCode && rates.length > 1) {
      const businessSpecific = rates.find((r) => r.businessId);
      return NextResponse.json({ success: true, rate: businessSpecific || rates[0], rates });
    }

    return NextResponse.json({ success: true, rate: rates[0] || null, rates });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/hsn-tax-rates -- creates/updates a business-specific override.
export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("gst", "manage_settings"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    const body = await req.json();
    const { businessId, hsnCode, gstRate, category, description } = body;

    if (!businessId || !Types.ObjectId.isValid(businessId)) {
      return NextResponse.json({ success: false, error: "businessId is required" }, { status: 400 });
    }
    if (!hsnCode?.trim() || gstRate === undefined || gstRate === null) {
      return NextResponse.json({ success: false, error: "hsnCode and gstRate are required" }, { status: 400 });
    }

    await connectDB();

    const rate = await HsnTaxRate.findOneAndUpdate(
      { businessId: new Types.ObjectId(businessId), hsnCode: hsnCode.trim() },
      { $set: { gstRate: Number(gstRate), category: category?.trim(), description: description?.trim() } },
      { new: true, upsert: true, runValidators: true }
    );

    logAction({ action: "CREATE", entity: "HsnTaxRate", entityId: rate?._id?.toString(), after: body, req });

    return NextResponse.json({ success: true, rate }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
