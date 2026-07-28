/**
 * GET /api/public/workorder-status?jobSheetNumber=...  OR  ?phone=...
 *
 * PUBLIC, unauthenticated. Lets a customer check their repair status
 * without logging in, per explicit direction ("build a page where customer
 * or any user can see their workorder status with workorder number or
 * mobile ... and most recent repair only will shown there").
 *
 * - jobSheetNumber returns that exact job sheet (if any).
 * - phone returns only the SINGLE most recent job sheet for that number
 *   (sorted by createdAt desc) -- deliberately not a full history list, so
 *   this can't be used to enumerate every past repair for a phone number.
 *
 * Response is intentionally minimal -- no address, no pricing, no internal
 * notes -- just enough for a customer to know where their repair stands.
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import CrmJobSheet from "@/models/CrmJobSheet";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const jobSheetNumber = searchParams.get("jobSheetNumber")?.trim();
    const phone = searchParams.get("phone")?.trim();

    if (!jobSheetNumber && !phone) {
      return NextResponse.json(
        { success: false, message: "jobSheetNumber or phone is required" },
        { status: 400 }
      );
    }

    await connectDB();

    const query: Record<string, unknown> = { isDeleted: false };
    if (jobSheetNumber) query.jobSheetNumber = jobSheetNumber;
    else query.phone = phone;

    const jobSheet = await CrmJobSheet.findOne(query)
      .sort({ createdAt: -1 })
      .select("jobSheetNumber status product deviceModel createdAt completedAt assignedToName scheduledAt")
      .lean<any>();

    if (!jobSheet) {
      return NextResponse.json(
        { success: false, message: "No workorder found for that reference" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      workorder: {
        jobSheetNumber: jobSheet.jobSheetNumber,
        status: jobSheet.status,
        product: jobSheet.product || jobSheet.deviceModel || "",
        engineerName: jobSheet.assignedToName || "",
        loggedAt: jobSheet.createdAt,
        scheduledAt: jobSheet.scheduledAt || null,
        completedAt: jobSheet.completedAt || null,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
