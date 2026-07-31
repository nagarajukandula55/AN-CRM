/**
 * GET /api/admin/pincode-tree — drives the state/city/pincode tree picker
 * used by the Service Center coverage assignment UI. Three modes based on
 * query params, computed from central-api's shared "pincode" dataset (see
 * src/lib/centralApiPincode.ts) instead of the local PincodeEntry
 * collection:
 *   ?level=states                -> distinct state names
 *   ?level=cities&state=X        -> distinct cities within that state
 *   ?level=pincodes&state=X&city=Y -> pincodes within that state+city
 */
import { NextRequest, NextResponse } from "next/server";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { getAllPincodeEntries } from "@/lib/centralApiPincode";

export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const level = searchParams.get("level") || "states";
    const state = searchParams.get("state") || undefined;
    const city = searchParams.get("city") || undefined;

    const entries = await getAllPincodeEntries();

    if (level === "states") {
      const states = Array.from(new Set(entries.map((e) => e.state).filter(Boolean)));
      return NextResponse.json({ success: true, states: states.sort() });
    }

    if (level === "cities") {
      if (!state) return NextResponse.json({ success: false, error: "state is required" }, { status: 400 });
      const cities = Array.from(
        new Set(entries.filter((e) => e.state === state).map((e) => e.city).filter(Boolean))
      );
      return NextResponse.json({ success: true, cities: cities.sort() });
    }

    if (level === "pincodes") {
      if (!state || !city) return NextResponse.json({ success: false, error: "state and city are required" }, { status: 400 });
      const pincodes = entries
        .filter((e) => e.state === state && e.city === city)
        .map((e) => e.pincode)
        .sort();
      return NextResponse.json({ success: true, pincodes });
    }

    return NextResponse.json({ success: false, error: "Invalid level" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Internal Server Error" }, { status: 500 });
  }
}
