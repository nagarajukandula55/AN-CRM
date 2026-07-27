import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit/logAction";

export async function POST(req: NextRequest) {
  const response = NextResponse.json({ success: true, message: "Logged out" });
  response.cookies.set("an_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

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
