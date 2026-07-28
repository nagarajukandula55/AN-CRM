/**
 * POST /api/feedback — a logged-in AN-CRM user (any role) submits product
 * feedback/bug report about the CRM itself. Distinct from POST /api/contact
 * (public, unauthenticated, customer-facing "contact us" for a business's
 * own storefront) -- this is in-app, tagged source: "in-app-feedback", and
 * always stamped with the submitting user's real identity + active
 * business, never anonymous. Lands in the same Feedback model/admin inbox
 * (GET /api/admin/feedback) so there's one place to review both kinds,
 * distinguishable by `source`.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Feedback from "@/models/Feedback";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { logAction } from "@/lib/audit/logAction";

export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    if (!session.business?.businessId) {
      return NextResponse.json({ success: false, message: "No active business" }, { status: 400 });
    }

    const body = await req.json();
    const { message } = body;
    if (!message?.trim()) {
      return NextResponse.json({ success: false, message: "Feedback message is required" }, { status: 400 });
    }

    await connectDB();

    const feedback = await Feedback.create({
      businessId: session.business.businessId,
      name: session.user.name || "AN-CRM user",
      email: session.user.email,
      message: message.trim(),
      source: "in-app-feedback",
    });

    logAction({
      action: "CREATE",
      entity: "Feedback",
      entityId: feedback._id.toString(),
      after: { source: "in-app-feedback" },
      req,
    });

    return NextResponse.json({ success: true, feedback }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
