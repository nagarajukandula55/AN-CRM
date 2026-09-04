/**
 * GET/PATCH /api/vendor/saved-catalog — this vendor's own quick-add
 * dropdown suggestions (Brand/Model/Payment-Collector names typed in via
 * the workorder intake screen's "add new" mini-modal) plus their own
 * default labour charge. Vendor-scoped equivalent of the fields the
 * console-side _JobSheetForm reads/writes via /api/businesses/[id] --
 * that route now correctly rejects a vendor Owner/Manager (see its own
 * comment), so the shared jobsheet form uses THIS endpoint instead when
 * rendered inside /vendor/* (see basePath/useVendorScope props).
 * Deliberately narrow: never exposes or accepts any other Business/
 * VendorProfile field.
 */
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import VendorProfile from "@/models/VendorProfile";
import { resolveOwnerOrManagerVendor, vendorHasModule } from "@/core/access/vendorAccess.service";

export async function GET() {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    const vendor = await resolveOwnerOrManagerVendor(userId);
    if (!vendor) {
      return NextResponse.json({ success: false, error: "Only a vendor Owner or Manager can view this" }, { status: 403 });
    }
    const v = vendor as any;
    return NextResponse.json({
      success: true,
      savedBrands: v.savedBrands || [],
      savedModelsByBrand: v.savedModelsByBrand || {},
      savedPaymentCollectors: v.savedPaymentCollectors || [],
      defaultLabourCharge: Number(v.defaultLabourCharge) || 0,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    const vendor = await resolveOwnerOrManagerVendor(userId);
    if (!vendor) {
      return NextResponse.json({ success: false, error: "Only a vendor Owner or Manager can change this" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const update: Record<string, unknown> = {};
    if (Array.isArray(body.savedBrands)) update.savedBrands = body.savedBrands;
    if (body.savedModelsByBrand && typeof body.savedModelsByBrand === "object") update.savedModelsByBrand = body.savedModelsByBrand;
    if (Array.isArray(body.savedPaymentCollectors)) update.savedPaymentCollectors = body.savedPaymentCollectors;
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ success: false, error: "Nothing to update" }, { status: 400 });
    }

    // Saving Brand/Model names is Pro+ only -- Starter had this stripped
    // ("no storage" for brands/device models), per explicit direction.
    // Payment-collector names are unaffected (not part of that gate).
    if ((update.savedBrands || update.savedModelsByBrand) && (vendor as any).businessId) {
      const allowed = await vendorHasModule(String((vendor as any).businessId), String((vendor as any)._id), "brands");
      if (!allowed) {
        return NextResponse.json({ success: false, error: "Saving Brands & Device Models is available on the Pro plan and above." }, { status: 403 });
      }
    }

    await VendorProfile.updateOne({ _id: (vendor as any)._id }, { $set: update });
    return NextResponse.json({ success: true, ...update });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
