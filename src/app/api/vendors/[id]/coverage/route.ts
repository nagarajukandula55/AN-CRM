/**
 * GET/PUT /api/vendors/[id]/coverage — read/update a Service Center's
 * serviceCoverage tree (state/city/pincode-level entries, separately for
 * onsite visits vs walk-in drop-offs). Used by the admin pincode-tree
 * assignment UI (/admin/vendors/[id]/coverage).
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import VendorProfile from "@/models/VendorProfile";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

type RouteContext = { params: Promise<{ id: string }> };

const VALID_LEVELS = ["STATE", "CITY", "PINCODE"];

function sanitizeEntries(input: unknown): { level: string; state: string; city?: string; pincode?: string }[] {
  if (!Array.isArray(input)) return [];
  const out: { level: string; state: string; city?: string; pincode?: string }[] = [];
  for (const e of input) {
    if (!e || typeof e !== "object") continue;
    const level = String((e as any).level || "").toUpperCase();
    const state = String((e as any).state || "").trim();
    if (!VALID_LEVELS.includes(level) || !state) continue;
    const entry: { level: string; state: string; city?: string; pincode?: string } = { level, state };
    if (level === "CITY" || level === "PINCODE") {
      const city = String((e as any).city || "").trim();
      if (!city) continue;
      entry.city = city;
    }
    if (level === "PINCODE") {
      const pincode = String((e as any).pincode || "").trim();
      if (!/^[1-9][0-9]{5}$/.test(pincode)) continue;
      entry.pincode = pincode;
    }
    out.push(entry);
  }
  return out;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    await connectDB();
    const session = await getEnrichedSession();
    if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    requirePermission(session as any, buildPermissionCode("vendors", "view"));

    const { id } = await context.params;
    const vendor = await VendorProfile.findById(id).select("companyName serviceCoverage servicePincodes").lean();
    if (!vendor) return NextResponse.json({ success: false, error: "Vendor not found" }, { status: 404 });

    return NextResponse.json({
      success: true,
      companyName: (vendor as any).companyName,
      serviceCoverage: (vendor as any).serviceCoverage || { onsite: [], walkin: [] },
      servicePincodes: (vendor as any).servicePincodes || [],
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    await connectDB();
    const session = await getEnrichedSession();
    if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    requirePermission(session as any, buildPermissionCode("vendors", "edit"));

    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));

    const onsite = sanitizeEntries(body?.onsite);
    const walkin = sanitizeEntries(body?.walkin);

    const vendor = await VendorProfile.findByIdAndUpdate(
      id,
      { $set: { serviceCoverage: { onsite, walkin } } },
      { new: true }
    ).select("companyName serviceCoverage");
    if (!vendor) return NextResponse.json({ success: false, error: "Vendor not found" }, { status: 404 });

    return NextResponse.json({ success: true, serviceCoverage: vendor.serviceCoverage });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Internal Server Error" }, { status: 500 });
  }
}
