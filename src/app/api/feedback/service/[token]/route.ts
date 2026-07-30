/**
 * Public (no-login) NPS survey endpoints, reached via the link sent to a
 * customer's phone after their device is handed over -- see
 * CrmJobSheet.feedbackToken and api/cron/service-feedback-followup.
 *
 * GET  — resolves the token to a minimal job summary so the survey page
 *        has something to show ("How was the repair of your iPhone 13?").
 *        404s for an unknown/expired token, and once feedback has already
 *        been submitted (so the same link can't be replayed).
 * POST — records the NPS score (+ optional comment). One submission per
 *        job sheet, enforced by ServiceFeedback's unique jobSheetId index.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import CrmJobSheet from "@/models/CrmJobSheet";
import ServiceFeedback from "@/models/ServiceFeedback";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    await connectDB();

    const jobSheet = await CrmJobSheet.findOne({ feedbackToken: token, isDeleted: false })
      .select("jobSheetNumber customerName product deviceModel businessId")
      .lean<any>();
    if (!jobSheet) {
      return NextResponse.json({ success: false, message: "This feedback link is invalid or has expired." }, { status: 404 });
    }

    const existing = await ServiceFeedback.findOne({ jobSheetId: jobSheet._id }).lean();
    if (existing) {
      return NextResponse.json({ success: false, alreadySubmitted: true, message: "You've already shared feedback for this service." }, { status: 409 });
    }

    return NextResponse.json({
      success: true,
      jobSheet: {
        jobSheetNumber: jobSheet.jobSheetNumber,
        customerName: jobSheet.customerName,
        device: [jobSheet.product, jobSheet.deviceModel].filter(Boolean).join(" · "),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const body = await req.json();
    const { npsScore, comment } = body;

    if (npsScore === undefined || npsScore === null || isNaN(Number(npsScore)) || Number(npsScore) < 0 || Number(npsScore) > 10) {
      return NextResponse.json({ success: false, message: "A score from 0 to 10 is required." }, { status: 400 });
    }

    await connectDB();

    const jobSheet = await CrmJobSheet.findOne({ feedbackToken: token, isDeleted: false })
      .select("businessId customerName phone")
      .lean<any>();
    if (!jobSheet) {
      return NextResponse.json({ success: false, message: "This feedback link is invalid or has expired." }, { status: 404 });
    }

    try {
      await ServiceFeedback.create({
        businessId: jobSheet.businessId,
        jobSheetId: jobSheet._id,
        customerName: jobSheet.customerName,
        customerPhone: jobSheet.phone,
        npsScore: Number(npsScore),
        comment: comment?.trim() || undefined,
      });
    } catch (err: any) {
      if (err?.code === 11000) {
        return NextResponse.json({ success: false, alreadySubmitted: true, message: "You've already shared feedback for this service." }, { status: 409 });
      }
      throw err;
    }

    return NextResponse.json({ success: true, message: "Thank you for your feedback!" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
