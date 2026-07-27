/**
 * NextAuth compatibility stub
 *
 * Auth has been migrated to a custom JWT system.
 * Use:
 *   POST /api/auth/login     — sign in
 *   POST /api/auth/logout    — sign out
 *   GET  /api/auth/me        — current user
 *   POST /api/auth/change-password — change password
 *
 * This stub returns a helpful message for legacy callers.
 */
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    { message: "Auth is handled via custom JWT. See /api/auth/login and /api/auth/me." },
    { status: 200 }
  );
}

export function POST() {
  return NextResponse.json(
    { message: "Auth is handled via custom JWT. See /api/auth/login." },
    { status: 200 }
  );
}
