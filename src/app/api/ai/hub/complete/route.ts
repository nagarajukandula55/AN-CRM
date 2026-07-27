/**
 * AI Hub — centralized completion endpoint for external apps/tools.
 *
 * This is the "add your AI credentials once, use them everywhere" endpoint:
 * AN Dev Studio (and any other app/website) points its provider fallback
 * chain at this route instead of asking the user to paste API keys into
 * every app separately. Credentials live per-business as AI-provider
 * Integration records (src/models/Integration.ts, AI_PROVIDER_KEYS),
 * managed from Integrations -> AI in the admin UI.
 *
 * Auth: a shared secret (AI_HUB_SECRET env var), sent as
 * `Authorization: Bearer <secret>` -- this is a server-to-server endpoint
 * called by other applications, not a logged-in ANgroup user, so it can't
 * use the usual x-user-id session header. If AI_HUB_SECRET isn't set the
 * endpoint refuses all requests (fails closed, unlike the CRON_SECRET
 * convention elsewhere in this app which fails open when unset).
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { callAIWithFailover, loadBusinessCredentials } from "@/core/ai/orchestrator";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.AI_HUB_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const businessId = body?.businessId;
  const prompt = body?.prompt;
  const systemPrompt = body?.systemPrompt;

  if (!businessId || typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json(
      { success: false, error: "businessId and prompt are required" },
      { status: 400 },
    );
  }

  await connectDB();

  const businessCreds = await loadBusinessCredentials(businessId);
  const result = await callAIWithFailover(prompt, systemPrompt, businessCreds);

  if ("error" in result) {
    return NextResponse.json({ success: false, error: result.error }, { status: 502 });
  }

  return NextResponse.json({ success: true, text: result.text, providerUsed: result.providerUsed });
}

// CORS preflight for cross-origin apps (e.g. AN Dev Studio calling from localhost/desktop).
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
