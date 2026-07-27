import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import Feedback from "@/models/Feedback";
import ContactMessage from "@/models/ContactMessage";
import { notify } from "@/lib/notify";
import { logAction } from "@/lib/audit/logAction";
import { sendTelegramMessage } from "@/lib/telegram";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Native's contact.ts (lib/an-sdk/contact.ts) never sends a businessId in
// its payload, so this falls back to the Native storefront's Business._id
// (same hardcoded id used in services/order.service.ts's NATIVE_BUSINESS_ID)
// when the caller doesn't supply one explicitly.
const DEFAULT_BUSINESS_ID = "6a4abddcf35feedb2392f556";

/**
 * POST /api/contact — PUBLIC, unauthenticated. Handles TWO distinct
 * callers on the same path, branched on whether the body carries a
 * `subject` field:
 *
 *  - Native's storefront widget (lib/an-sdk/contact.ts) posts
 *    { name, email?, phone?, message, businessId? } with no `subject` —
 *    that flow is UNCHANGED below, still writes to Feedback so it keeps
 *    surfacing in /admin/feedback exactly as before.
 *  - AN Group's own public "Contact Us" page (app/contact/page.tsx) posts
 *    { name, email, phone?, subject, message } — routed to the new
 *    ContactMessage model / /admin/contact-messages inbox instead, since
 *    it's a genuinely different, site-wide (non-business-scoped) inbox.
 *
 * Kept on one path rather than splitting into two routes because this
 * exact path ("/api/contact") is already registered PUBLIC and depended on
 * by the live Native integration — safer to branch than to risk a second,
 * differently-cased/prefixed public route slipping past middleware.
 */
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const body = await req.json().catch(() => ({}));
    const subject = typeof body?.subject === "string" ? body.subject.trim() : "";

    if (subject) {
      // ---- AN Group public Contact Us form ------------------------------
      const name = String(body?.name || "").trim();
      const email = String(body?.email || "").trim().toLowerCase();
      const phone = String(body?.phone || "").trim();
      const message = String(body?.message || "").trim();

      if (!name) {
        return NextResponse.json({ success: false, message: "Name is required" }, { status: 400 });
      }
      if (!email || !EMAIL_REGEX.test(email)) {
        return NextResponse.json({ success: false, message: "A valid email address is required" }, { status: 400 });
      }
      if (!message) {
        return NextResponse.json({ success: false, message: "Message is required" }, { status: 400 });
      }

      const contactMessage = await ContactMessage.create({
        name,
        email,
        phone: phone || undefined,
        subject,
        message,
        status: "NEW",
      });

      // Fire-and-forget -- a Telegram outage must never fail the submission.
      try {
        const preview = message.length > 100 ? `${message.slice(0, 100)}…` : message;
        await sendTelegramMessage(
          `New contact message from ${name} (${email})\nSubject: ${subject}\n${preview}`
        );
      } catch (err) {
        console.error("[contact] Telegram notify failed:", err);
      }

      return NextResponse.json({ success: true, id: contactMessage._id?.toString() }, { status: 201 });
    }

    // ---- Legacy: Native storefront contact widget -> Feedback -----------
    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const phone = String(body?.phone || "").trim();
    const message = String(body?.message || "").trim();
    const businessId =
      body?.businessId && mongoose.Types.ObjectId.isValid(body.businessId)
        ? body.businessId
        : DEFAULT_BUSINESS_ID;

    if (!name) {
      return NextResponse.json({ success: false, message: "Name is required" }, { status: 400 });
    }
    if (!message) {
      return NextResponse.json({ success: false, message: "Message is required" }, { status: 400 });
    }
    if (email && !EMAIL_REGEX.test(email)) {
      return NextResponse.json({ success: false, message: "Invalid email" }, { status: 400 });
    }

    const feedback = await Feedback.create({
      businessId: new mongoose.Types.ObjectId(businessId),
      name,
      email,
      phone,
      message,
      status: "NEW",
      source: "contact-form",
    });

    // Best-effort — submission already succeeded above regardless.
    notify({
      event: "STAFF_ALERT",
      businessId: String(businessId),
      message: `📩 New contact form submission from ${name}${email ? ` (${email})` : ""}\n${message}`,
    }).catch(() => {});

    logAction({
      action: "CREATE",
      entity: "Feedback",
      entityId: feedback._id?.toString(),
      after: feedback,
      req,
      actor: { id: "public", businessId: String(businessId) },
    });

    return NextResponse.json(
      { success: true, message: "Thank you for your feedback", id: String(feedback._id) },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("Contact form POST error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/contact — protected admin inbox listing for AN Group's own
 * ContactMessage submissions, newest first. Public middleware treatment of
 * the base "/api/contact" path only means "don't 401 before the route
 * runs" -- this handler still enforces its own session + permission check.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("contact_messages", "view"));
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    await connectDB();

    const status = req.nextUrl.searchParams.get("status");
    const filter: any = {};
    if (status && ["NEW", "READ", "RESOLVED"].includes(status)) {
      filter.status = status;
    }

    const messages = await ContactMessage.find(filter).sort({ createdAt: -1 }).lean();

    return NextResponse.json({ success: true, messages });
  } catch (err: any) {
    console.error("Contact GET error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
