import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import AnuIssue from "@/models/AnuIssue";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { notify } from "@/lib/notify";
import { notifySuperAdmins } from "@/services/notification.service";

// Same fallback convention as api/contact/route.ts: native never sends a
// businessId explicitly, so a caller with no businessId (and no active
// business on their session) defaults to the Native storefront's Business._id.
const DEFAULT_BUSINESS_ID = "6a4abddcf35feedb2392f556";

/**
 * POST /api/anu/issues — report a problem *through ANu*, from any property
 * (this admin panel's widget, native's storefront ANu page, or a future
 * site). Requires a signed-in ANu user (native customers already
 * authenticate against this same platform per ANGROUP_INTEGRATION_STATUS.md)
 * so issues are attributable, not anonymous like /api/contact.
 *
 * Every issue raises both an in-app notification (notifySuperAdmins, shows
 * in the NotificationBell) and the existing STAFF_ALERT dispatcher (Telegram/
 * WhatsApp per Settings > Integrations) - this is the "all notifications
 * pass through ANu" path: an ANu-reported issue is what triggers them.
 *
 * Two ways to authenticate:
 *  - a signed-in human (x-user-id, set by this app's own middleware from a
 *    session) - reporterId is stamped, same as before.
 *  - a backend service with no human session (e.g. ACP's
 *    AnuReportingDeadLetterQueue reporting a permanently-failed message) via
 *    `x-service-key` matching ANU_SERVICE_KEY. No reporterId is stamped for
 *    these - `source` is required instead, so the report is still
 *    attributable to which system sent it.
 */
export async function POST(req: NextRequest) {
  try {
    const h = req.headers;
    const userId = h.get("x-user-id");
    const serviceKey = h.get("x-service-key");
    const isServiceCaller = Boolean(serviceKey) && serviceKey === process.env.ANU_SERVICE_KEY;

    if (!userId && !isServiceCaller) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const body = await req.json().catch(() => ({}));
    const title = String(body?.title || "").trim();
    const description = String(body?.description || "").trim();
    const severity = ["LOW", "MEDIUM", "HIGH"].includes(body?.severity) ? body.severity : "MEDIUM";
    const source = String(body?.source || "anu-widget").trim();
    const reporterEmail = body?.reporterEmail ? String(body.reporterEmail).trim().toLowerCase() : undefined;

    if (isServiceCaller && !body?.source) {
      return NextResponse.json({ success: false, message: "source is required for service-authenticated reports" }, { status: 400 });
    }

    const headerBizId = h.get("x-active-business-id");
    const bodyBizId = body?.businessId && mongoose.Types.ObjectId.isValid(body.businessId) ? body.businessId : undefined;
    const businessId = headerBizId || bodyBizId || DEFAULT_BUSINESS_ID;

    if (!title) {
      return NextResponse.json({ success: false, message: "Title is required" }, { status: 400 });
    }
    if (!description) {
      return NextResponse.json({ success: false, message: "Description is required" }, { status: 400 });
    }

    const issue = await AnuIssue.create({
      businessId: new mongoose.Types.ObjectId(businessId),
      ...(userId ? { reporterId: new mongoose.Types.ObjectId(userId) } : {}),
      reporterEmail,
      source,
      title,
      description,
      severity,
      status: "OPEN",
    });

    const summary = `🤖 ANu issue reported (${severity}): ${title}\n${description}`;
    notifySuperAdmins({
      title: "New ANu issue report",
      message: `${title} — ${severity}`,
      type: severity === "HIGH" ? "error" : "warning",
      link: "/admin/anu-issues",
    }).catch(() => {});
    notify({ event: "STAFF_ALERT", businessId: String(businessId), message: summary }).catch(() => {});

    return NextResponse.json({ success: true, id: String(issue._id) }, { status: 201 });
  } catch (err: any) {
    console.error("ANu issue POST error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/anu/issues — admin list, same session/business-scoping
 * convention as api/admin/feedback/route.ts.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const h = req.headers;
    const bizId = h.get("x-active-business-id") || req.nextUrl.searchParams.get("businessId");
    const status = req.nextUrl.searchParams.get("status");

    const isPlatformStaff = session.isSuperAdmin || h.get("x-is-platform-staff") === "true";
    if (!bizId && !isPlatformStaff) {
      return NextResponse.json({ success: false, message: "businessId is required" }, { status: 400 });
    }

    const query: Record<string, unknown> = {};
    if (bizId) query.businessId = bizId;
    if (status && status !== "ALL") query.status = status;

    const items = await AnuIssue.find(query).sort({ createdAt: -1 }).limit(500).lean();

    return NextResponse.json({ success: true, items });
  } catch (err: any) {
    console.error("ANu issues GET error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
