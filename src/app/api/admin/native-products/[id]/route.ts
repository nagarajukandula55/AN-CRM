import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import NativeProduct from "@/models/NativeProduct";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { logAction } from "@/lib/audit/logAction";

// PATCH /api/admin/native-products/:id — { isActive } toggle, or
// { isDeleted: true } to soft-delete a stray/junk storefront listing.
// Soft delete, not a hard remove -- consistent with every other
// isDeleted-flagged model in this codebase, and reversible if a listing
// was pulled by mistake.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user || !session.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    await connectDB();

    const body = await req.json();
    const update: Record<string, unknown> = {};
    if (body.isActive !== undefined) update.isActive = !!body.isActive;
    if (body.isDeleted !== undefined) update.isDeleted = !!body.isDeleted;
    // Per-unit weight (kg) -- feeds the mobile app's bulk/wholesale order
    // detection (a BUSINESS-account order qualifies at 10kg+ total).
    if (body.weightKg !== undefined) update.weightKg = Math.max(0, Number(body.weightKg) || 0);

    const product = await NativeProduct.findByIdAndUpdate(id, update, { new: true });
    if (!product) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });

    logAction({
      action: "UPDATE",
      entity: "NativeProduct",
      entityId: id,
      after: { isActive: product.isActive, isDeleted: product.isDeleted },
      req,
      actor: { businessId: product.businessId?.toString() },
    });

    return NextResponse.json({ success: true, data: product });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
