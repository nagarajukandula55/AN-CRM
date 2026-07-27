/**
 * GET /api/crm/jobsheets/[id]/intake-receipt — the printable receipt
 * issued when a device is dropped off, BEFORE repair starts / before the
 * call is closed (distinct from api/crm/jobsheets/[id]/service-record,
 * which is only available AFTER closing). Modeled on a standard OEM
 * service-handover-report layout up through the signature line.
 *
 * The header logo is Business.customerLogoUrl (Settings > Business
 * Settings), NOT the device brand's own logo/name -- per explicit
 * direction, this document should never show the manufacturer's
 * branding. Blank means no logo prints at all, no fallback to the brand
 * or the vendor's own logo. "Special Notice" reuses the business's own
 * Terms & Conditions (Settings > Business Settings) rather than a
 * second, separate text field -- same text already shown on workorder/
 * estimate/invoice prints.
 */
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import CrmJobSheet from "@/models/CrmJobSheet";
import Business from "@/models/Business";
import "@/models/User";
import "@/models/Brand";
import "@/models/FaultCode";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { resolveVendorContext } from "@/lib/auth/vendorContext";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("crm_jobsheets", "view"));
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid job sheet id" }, { status: 400 });
    }

    await connectDB();

    const jobSheet = await CrmJobSheet.findOne({ _id: id, isDeleted: false })
      .populate("brandId", "name logoUrl")
      .populate("faultCodeId", "code description")
      .populate("createdBy", "name email")
      .lean();

    if (!jobSheet) {
      return NextResponse.json({ success: false, message: "Job sheet not found" }, { status: 404 });
    }

    const business = await Business.findById((jobSheet as any).businessId).select("termsAndConditions customerLogoUrl").lean();

    const userId = session.user.id;
    const ctx = await resolveVendorContext(userId).catch(() => null);

    return NextResponse.json({
      success: true,
      jobSheet,
      specialNotice: (business as any)?.termsAndConditions || "",
      // Shown instead of the device brand's own logo, per explicit
      // direction -- blank means no logo prints at all.
      customerLogoUrl: (business as any)?.customerLogoUrl || "",
      vendor: ctx?.vendor
        ? {
            companyName: (ctx.vendor as any).companyName,
            phone: (ctx.vendor as any).phone,
            address: (ctx.vendor as any).address,
            serviceCenterInfo: (ctx.vendor as any).serviceCenterInfo,
          }
        : null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
