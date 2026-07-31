import { NextRequest, NextResponse } from "next/server";

type RouteContext = { params: Promise<{ pincode: string }> };

/**
 * GET /api/pincode/[pincode] — looks up state/district/city for a 6-digit
 * Indian PIN code. Backs the client-side PincodeInput component's autofill
 * (src/components/shared/LocationSelect.tsx).
 *
 * Pincode data now lives centrally in central-api's "pincode" dataset (one
 * shared directory for every AN group property), not in this app's own
 * MongoDB — see ANGROUP_INTEGRATION_STATUS.md for the migration. A miss
 * against the central directory falls back to the public India Post API,
 * and the result is written back into central-api so it's available to
 * every other property on the next lookup, without needing another
 * per-app fallback.
 */
const CENTRAL_API_URL = process.env.CENTRAL_API_URL;
const CENTRAL_API_KEY = process.env.CENTRAL_API_KEY;
const FALLBACK_API = "https://api.postalpincode.in/pincode";
const FALLBACK_TIMEOUT_MS = 4000;

async function lookupFromCentralApi(pincode: string) {
  const res = await fetch(
    `${CENTRAL_API_URL}/api/v1/pincode?search=${encodeURIComponent(`pincode:${pincode}`)}&limit=1`,
    { headers: { "x-api-key": CENTRAL_API_KEY || "" }, cache: "no-store" }
  );
  if (!res.ok) throw new Error(`central-api pincode lookup failed (${res.status})`);
  const body = await res.json();
  return body.items && body.items[0] ? body.items[0] : null;
}

async function lookupFromFallbackApi(pincode: string) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FALLBACK_TIMEOUT_MS);
    const res = await fetch(`${FALLBACK_API}/${pincode}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;

    const data = await res.json();
    const postOffice = data?.[0]?.PostOffice?.[0];
    if (!postOffice) return null;

    return {
      pincode,
      state: postOffice.State || "",
      district: postOffice.District || "",
      city: postOffice.Name || postOffice.Block || postOffice.District || "",
    };
  } catch {
    return null; // network error / timeout - treat like "not found"
  }
}

// Best-effort write-through cache into central-api. A 409 (someone else
// cached it first, or a dedup match) is expected and fine - ignore it.
async function cacheIntoCentralApi(entry: { pincode: string; state: string; district: string; city: string }) {
  try {
    await fetch(`${CENTRAL_API_URL}/api/v1/pincode`, {
      method: "POST",
      headers: { "x-api-key": CENTRAL_API_KEY || "", "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
  } catch {
    // best-effort only - a failed cache write shouldn't fail the lookup response
  }
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { pincode } = await context.params;
    if (!/^[1-9][0-9]{5}$/.test(pincode)) {
      return NextResponse.json(
        { success: false, message: "Invalid pincode format" },
        { status: 400 }
      );
    }

    if (!CENTRAL_API_URL) {
      return NextResponse.json(
        { success: false, message: "CENTRAL_API_URL is not configured" },
        { status: 500 }
      );
    }

    let entry = await lookupFromCentralApi(pincode);

    if (!entry) {
      const fallback = await lookupFromFallbackApi(pincode);
      if (!fallback) {
        return NextResponse.json({ success: true, found: false });
      }
      entry = fallback;
      // Awaited (not fire-and-forget) - a serverless function can be frozen
      // the instant the response is sent, which would kill an unawaited
      // write before it reaches central-api.
      await cacheIntoCentralApi(fallback);
    }

    return NextResponse.json({
      success: true,
      found: true,
      state: entry.state,
      district: entry.district,
      city: entry.city,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Lookup failed" },
      { status: 500 }
    );
  }
}
