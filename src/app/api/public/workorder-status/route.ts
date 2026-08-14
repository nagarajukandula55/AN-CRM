/**
 * GET /api/public/workorder-status?jobSheetNumber=...
 *
 * PUBLIC, unauthenticated. Lets a customer check their repair status by
 * workorder number only -- per explicit direction, phone-number lookup
 * removed (a phone match returning someone's most-recent-of-many repairs
 * was a weaker, less precise identifier than the number printed on their
 * own intake receipt, and the two-mode UI added friction for no benefit).
 *
 * Response includes just enough for a customer to feel informed without
 * leaking internal data -- no pricing, no internal notes, no other
 * customers' data -- but now also identifies the service center handling
 * the repair (name/phone/logo) and the device/issue on file, not just a
 * bare status code.
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import CrmJobSheet from "@/models/CrmJobSheet";
import Business from "@/models/Business";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const jobSheetNumber = searchParams.get("jobSheetNumber")?.trim();

    if (!jobSheetNumber) {
      return NextResponse.json(
        { success: false, message: "jobSheetNumber is required" },
        { status: 400 }
      );
    }

    await connectDB();

    const jobSheet = await CrmJobSheet.findOne({ jobSheetNumber, isDeleted: false })
      .select(
        "jobSheetNumber status product deviceModel imeiOrSerialNumber issueDescription createdAt completedAt assignedToName scheduledAt businessId"
      )
      .lean<any>();

    if (!jobSheet) {
      return NextResponse.json(
        { success: false, message: "No workorder found for that number. Double-check it against your intake receipt." },
        { status: 404 }
      );
    }

    const business = await Business.findById(jobSheet.businessId)
      .select("name brandName phone logo city state")
      .lean<any>();

    return NextResponse.json({
      success: true,
      workorder: {
        jobSheetNumber: jobSheet.jobSheetNumber,
        status: jobSheet.status,
        product: jobSheet.product || jobSheet.deviceModel || "",
        imei: jobSheet.imeiOrSerialNumber || "",
        issueDescription: jobSheet.issueDescription || "",
        engineerName: jobSheet.assignedToName || "",
        loggedAt: jobSheet.createdAt,
        scheduledAt: jobSheet.scheduledAt || null,
        completedAt: jobSheet.completedAt || null,
        serviceCenter: business
          ? {
              name: business.brandName || business.name || "",
              phone: business.phone || "",
              logo: business.logo || "",
              location: [business.city, business.state].filter(Boolean).join(", "),
            }
          : null,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
