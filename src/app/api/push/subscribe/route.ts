/**
 * POST /api/push/subscribe — save a browser's Web Push subscription for
 * the logged-in user (see models/PushSubscription.ts).
 * DELETE /api/push/subscribe — remove one (endpoint in body), e.g. when
 * the user disables notifications from their browser.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import PushSubscription from "@/models/PushSubscription";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

export async function POST(req: NextRequest) {
  const session = await getEnrichedSession();
  if (!session?.user) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { endpoint, keys } = body?.subscription || body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ success: false, message: "Invalid subscription" }, { status: 400 });
  }

  await connectDB();
  await PushSubscription.findOneAndUpdate(
    { userId: session.user.id, endpoint },
    { userId: session.user.id, endpoint, keys, userAgent: req.headers.get("user-agent") || "" },
    { upsert: true }
  );

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getEnrichedSession();
  if (!session?.user) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const endpoint = body?.endpoint;
  if (!endpoint) {
    return NextResponse.json({ success: false, message: "endpoint is required" }, { status: 400 });
  }

  await connectDB();
  await PushSubscription.deleteOne({ userId: session.user.id, endpoint });

  return NextResponse.json({ success: true });
}
