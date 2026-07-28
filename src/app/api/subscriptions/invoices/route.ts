/**
 * GET /api/subscriptions/invoices — this business's own AN-CRM plan-
 * payment invoices (SubscriptionInvoice), newest first. Backs the invoice
 * history list on /console/plan.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SubscriptionInvoice from "@/models/SubscriptionInvoice";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user || !session.business?.businessId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    await connectDB();
    const invoices = await SubscriptionInvoice.find({ businessId: session.business.businessId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    return NextResponse.json({ success: true, invoices });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
