/**
 * GET /api/admin/pincode-tree — drives the state/city/pincode tree picker
 * used by the Service Center coverage assignment UI. Three modes based on
 * query params, each a cheap aggregation over PincodeEntry (already loaded
 * via the pincode-data admin upload):
 *   ?level=states                -> distinct state names
 *   ?level=cities&state=X        -> distinct cities within that state
 *   ?level=pincodes&state=X&city=Y -> pincodes within that state+city
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import PincodeEntry from "@/models/PincodeEntry";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const session = await getEnrichedSession();
    if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const level = searchParams.get("level") || "states";
    const state = searchParams.get("state") || undefined;
    const city = searchParams.get("city") || undefined;

    if (level === "states") {
      const states = await PincodeEntry.distinct("state");
      return NextResponse.json({ success: true, states: states.sort() });
    }

    if (level === "cities") {
      if (!state) return NextResponse.json({ success: false, error: "state is required" }, { status: 400 });
      const cities = await PincodeEntry.distinct("city", { state });
      return NextResponse.json({ success: true, cities: cities.filter(Boolean).sort() });
    }

    if (level === "pincodes") {
      if (!state || !city) return NextResponse.json({ success: false, error: "state and city are required" }, { status: 400 });
      const entries = await PincodeEntry.find({ state, city }).select("pincode").sort({ pincode: 1 }).lean();
      return NextResponse.json({ success: true, pincodes: entries.map((e) => e.pincode) });
    }

    return NextResponse.json({ success: false, error: "Invalid level" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Internal Server Error" }, { status: 500 });
  }
}
