/**
 * GET /api/crm/jobsheets/[id]/service-record — the printable service
 * record shown once a job sheet is CLOSED, modeled on a standard OEM
 * service-report layout (RO number, device/fault/solution summary,
 * materials table, labor cost, total paid, service center details).
 *
 * Service center details (address/phone/hours/hotline) are pulled from
 * the vendor's own VendorProfile -- never hardcoded -- so each vendor's
 * printed record reflects their own info (see /vendor/profile's
 * "Service Record Details" settings section).
 */
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import CrmJobSheet from "@/models/CrmJobSheet";
import "@/models/User";
import "@/models/Brand";
import "@/models/FaultCode";
import "@/models/Solution";
import "@/models/SymptomCode";
import "@/models/BOM";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { resolveVendorContext } from "@/lib/auth/vendorContext";
import Business from "@/models/Business";

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
      .populate("brandId", "name")
      .populate("faultCodeId", "code description")
      .populate("solutionId", "code description")
      .populate("symptomCodeId", "code description")
      .populate("assignedTo", "name email")
      .populate("lineItems.serviceCenterBOMId", "partCode partName hsnCode")
      .lean();

    if (!jobSheet) {
      return NextResponse.json({ success: false, message: "Job sheet not found" }, { status: 404 });
    }
    if (!["REPAIR_COMPLETED", "CLOSED"].includes((jobSheet as any).status)) {
      return NextResponse.json(
        { success: false, message: "The service record is only available once this job sheet is completed/closed." },
        { status: 409 }
      );
    }

    // Service center details are the CALLER's own vendor, not derived from
    // the job sheet (CrmJobSheet has no vendorId of its own -- see its
    // model's top comment). Falls back to no vendor block (business-only
    // print) for a genuine business-wide caller with no vendor context.
    const h = await headers();
    const userId = h.get("x-user-id") || session.user.id;
    const ctx = await resolveVendorContext(userId).catch(() => null);
    const business = ctx?.vendor?.businessId
      ? await Business.findById(ctx.vendor.businessId).select("documentSignatureUrl").lean()
      : null;

    return NextResponse.json({
      success: true,
      jobSheet,
      vendor: ctx?.vendor
        ? {
            companyName: (ctx.vendor as any).companyName,
            phone: (ctx.vendor as any).phone,
            address: (ctx.vendor as any).address,
            serviceCenterInfo: (ctx.vendor as any).serviceCenterInfo,
          }
        : null,
      signatureUrl: (business as any)?.documentSignatureUrl || "",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
