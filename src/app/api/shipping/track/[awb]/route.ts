export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { syncTracking } from "@/lib/shipping/sync-tracking";

/* =========================
   GET TRACKING
========================= */

export async function GET(
  req: Request,
  context: any
) {
  try {
    await connectDB();

    const awb = context?.params?.awb;

    if (!awb) {
      return NextResponse.json(
        {
          success: false,
          message: "AWB missing",
        },
        { status: 400 }
      );
    }

    const result = await syncTracking(awb);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("TRACK ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: error.message || "Tracking failed",
      },
      { status: 500 }
    );
  }
}
