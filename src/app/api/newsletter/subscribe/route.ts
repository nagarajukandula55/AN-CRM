import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import NewsletterSubscriber from "@/models/NewsletterSubscriber";
import { sendNewsletterWelcomeEmail } from "@/services/email/resend.service";
import { captureCustomer } from "@/services/customer.service";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/newsletter/subscribe — PUBLIC. Body: { email, businessId }.
 * Idempotent: re-subscribing an existing (email, businessId) pair just
 * flips isActive back on rather than erroring on the unique index.
 */
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const body = await req.json();
    const email = String(body?.email || "").toLowerCase().trim();
    const businessId = body?.businessId;

    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json({ success: false, message: "Valid email is required" }, { status: 400 });
    }
    if (!businessId || !mongoose.Types.ObjectId.isValid(businessId)) {
      return NextResponse.json({ success: false, message: "businessId is required" }, { status: 400 });
    }

    const subscriber = await NewsletterSubscriber.findOneAndUpdate(
      { email, businessId },
      { $set: { isActive: true, unsubscribedAt: null } },
      { new: true, upsert: true }
    );

    // Best-effort — subscription itself already succeeded above regardless.
    sendNewsletterWelcomeEmail({ to: email, businessId }).catch(() => {});
    captureCustomer({ businessId, email, sourceModule: "NEWSLETTER", sourceLabel: "Newsletter signup" });

    return NextResponse.json(
      {
        success: true,
        message: "Subscribed successfully",
        subscriber: { id: String(subscriber._id), email: subscriber.email },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
