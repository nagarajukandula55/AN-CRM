import { NextResponse } from "next/server";
import { B2B_COOKIE_NAME } from "@/lib/auth/b2bSession";

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(B2B_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
}
