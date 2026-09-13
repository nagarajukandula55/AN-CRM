import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit/logAction";
import { extractToken, verifyToken } from "@/lib/auth/jwt";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";

export async function POST(req: NextRequest) {
  const response = NextResponse.json({ success: true, message: "Logged out" });
  response.cookies.set("an_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  // Free this device's slot immediately (out of the max-5 concurrent
  // sessions) rather than leaving it in User.activeSessions until it's
  // eventually evicted by a 6th login -- best-effort, never blocks the
  // logout response since the cookie clear above already ends this
  // device's session either way.
  const token = extractToken(req);
  const payload = token ? verifyToken(token) : null;
  if (payload?.id && payload?.sessionId) {
    connectDB()
      .then(() => User.updateOne({ _id: payload.id }, { $pull: { activeSessions: payload.sessionId } }))
      .catch(() => {});
  }

  logAction({
    action: "LOGOUT",
    entity: "User",
    req,
  });

  return response;
}

export async function GET(req: NextRequest) {
  return POST(req);
}
