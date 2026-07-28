import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import PincodeEntry from "@/models/PincodeEntry";

type RouteContext = { params: Promise<{ pincode: string }> };

// Public, no-auth India Post pincode API -- used only as a fallback for a
// pincode missing from our own seeded ~19,500-row directory (new pincodes
// get allotted over time; our seed is a point-in-time snapshot). A hit here
// is cached into PincodeEntry so the next lookup for the same pincode
// never needs the network again.
const FALLBACK_API = "https://api.postalpincode.in/pincode";
const FALLBACK_TIMEOUT_MS = 4000;

async function lookupFromFallbackApi(pincode: string): Promise<{ state: string; district: string; city: string } | null> {
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
      state: postOffice.State || "",
      district: postOffice.District || "",
      city: postOffice.Name || postOffice.Block || postOffice.District || "",
    };
  } catch {
    return null; // network error / timeout -- treat exactly like "not found"
  }
}

/**
 * GET /api/pincode/[pincode] — looks up state/district/city for a 6-digit
 * Indian PIN code. Backs the client-side PincodeInput component's
 * autofill (src/components/shared/LocationSelect.tsx). Data lives in
 * MongoDB (PincodeEntry collection) first, since this app deploys on
 * Vercel where the filesystem is read-only at runtime — see
 * PincodeEntry.ts's comment for the full reasoning. A miss against our own
 * seeded directory now falls back to the public India Post API rather than
 * just reporting "not found", and caches the result for next time.
 */
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { pincode } = await context.params;
    if (!/^[1-9][0-9]{5}$/.test(pincode)) {
      return NextResponse.json(
        { success: false, message: "Invalid pincode format" },
        { status: 400 }
      );
    }

    await connectDB();
    let entry = await PincodeEntry.findOne({ pincode }).lean();

    if (!entry) {
      const fallback = await lookupFromFallbackApi(pincode);
      if (!fallback) {
        return NextResponse.json({ success: true, found: false });
      }
      entry = await PincodeEntry.findOneAndUpdate(
        { pincode },
        { $setOnInsert: { pincode, ...fallback } },
        { upsert: true, new: true }
      ).lean();
    }

    return NextResponse.json({
      success: true,
      found: true,
      state: (entry as any).state,
      district: (entry as any).district,
      city: (entry as any).city,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Lookup failed" },
      { status: 500 }
    );
  }
}
