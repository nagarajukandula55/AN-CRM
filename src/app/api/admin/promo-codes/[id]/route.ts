import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import PromoCode from "@/models/PromoCode";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

// PATCH /api/admin/promo-codes/[id] — toggle isActive (deactivate a code
// instead of deleting it, so redemption history stays intact).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "Super Admin only" }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json();
    const { isActive } = body as { isActive?: boolean };

    await connectDB();
    const updated = await PromoCode.findByIdAndUpdate(id, { $set: { isActive: !!isActive } }, { new: true });
    if (!updated) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });

    return NextResponse.json({ success: true, code: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
