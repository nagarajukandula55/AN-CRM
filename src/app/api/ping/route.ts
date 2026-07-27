import { NextResponse } from "next/server";

/**
 * Bare-minimum diagnostic endpoint — no mongoose, no imports beyond
 * next/server itself. Used to isolate whether a hang is caused by the
 * MongoDB connection specifically, or by something upstream in how
 * serverless functions are being invoked/routed in this deployment.
 */
export async function GET() {
  return NextResponse.json({ ok: true, at: Date.now() });
}
