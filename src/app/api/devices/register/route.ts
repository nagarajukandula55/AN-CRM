import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import DeviceToken from "@/models/DeviceToken";

/**
 * POST /api/devices/register — a mobile client (ANgroup/mobile, ANu)
 * registers its Expo push token here after sign-in / on first launch if
 * already signed in. Upserts on token (not userId) since an Expo token is
 * stable per device+app install, not per user — this correctly moves the
 * token to whoever is currently signed in on that device instead of
 * accumulating stale duplicate rows.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "").trim();
    const platform = ["ios", "android"].includes(body?.platform) ? body.platform : "unknown";

    if (!token) {
      return NextResponse.json({ success: false, message: "token is required" }, { status: 400 });
    }

    await connectDB();
    await DeviceToken.findOneAndUpdate(
      { token },
      { userId, token, platform },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("POST /api/devices/register error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/devices/register — sign-out should stop pushing to a device
// that's no longer authenticated on it (shared/borrowed device case).
export async function DELETE(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "").trim();
    if (!token) {
      return NextResponse.json({ success: false, message: "token is required" }, { status: 400 });
    }

    await connectDB();
    await DeviceToken.deleteOne({ token, userId });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("DELETE /api/devices/register error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
