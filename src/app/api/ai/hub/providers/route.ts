/**
 * AI Hub — lists which AI providers are active for a business, without
 * exposing credentials. Lets a consuming app (e.g. AN Dev Studio) show
 * "connected providers" in its own UI before calling /api/ai/hub/complete.
 * Same shared-secret auth as the complete endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { loadBusinessCredentials } from "@/core/ai/orchestrator";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.AI_HUB_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ success: false, error: "businessId is required" }, { status: 400 });
  }

  await connectDB();
  const creds = await loadBusinessCredentials(businessId);

  return NextResponse.json({
    success: true,
    providers: creds.map((c) => c.provider.toLowerCase()),
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
