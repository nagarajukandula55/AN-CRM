import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import PincodeEntry from "@/models/PincodeEntry";

type RouteContext = { params: Promise<{ pincode: string }> };

/**
 * GET /api/pincode/[pincode] — looks up state/district/city for a 6-digit
 * Indian PIN code. Backs the client-side PincodeInput component's
 * autofill (src/components/shared/LocationSelect.tsx). Data lives in
 * MongoDB (PincodeEntry collection), not a static bundled file, since
 * this app deploys on Vercel where the filesystem is read-only at
 * runtime — see PincodeEntry.ts's comment for the full reasoning.
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
    const entry = await PincodeEntry.findOne({ pincode }).lean();

    if (!entry) {
      return NextResponse.json({ success: true, found: false });
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
