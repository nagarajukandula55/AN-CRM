import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Business from "@/models/Business";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

/**
 * PUT /api/businesses/[id]/default-public — dedicated toggle for
 * isDefaultPublicBusiness (see models/Business.ts's comment on that field).
 * Deliberately separate from PATCH /api/businesses/[id] (whose
 * EDITABLE_FIELDS doesn't include it), same reasoning as the /status
 * route: this decides which single business every public, unauthenticated
 * page across the whole platform defaults to, so it's a super-admin-only,
 * dedicated action, not a regular business-scoped edit.
 *
 * Turning this ON for one business turns it OFF for every other business
 * first (findOneAndUpdate wouldn't do this atomically across the whole
 * collection, so it's a two-step: unset everywhere, then set the target).
 */
export async function PUT(req: Request, context: any) {
  try {
    await connectDB();

    const id = context?.params?.id;
    if (!id) {
      return NextResponse.json({ success: false, message: "Missing business id" }, { status: 400 });
    }

    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    if (!session.isSuperAdmin) {
      return NextResponse.json(
        { success: false, message: "Only Super Admins can change the default public business" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    if (typeof body.isDefaultPublicBusiness !== "boolean") {
      return NextResponse.json(
        { success: false, message: "isDefaultPublicBusiness (boolean) is required" },
        { status: 400 }
      );
    }

    if (body.isDefaultPublicBusiness) {
      await Business.updateMany(
        { isDefaultPublicBusiness: true, _id: { $ne: id } },
        { $set: { isDefaultPublicBusiness: false } }
      );
    }

    const business = await Business.findByIdAndUpdate(
      id,
      { $set: { isDefaultPublicBusiness: body.isDefaultPublicBusiness } },
      { new: true }
    ).lean();
    if (!business) {
      return NextResponse.json({ success: false, message: "Business not found" }, { status: 404 });
    }

    logAction({
      action: "UPDATE",
      entity: "Business",
      entityId: id,
      after: { isDefaultPublicBusiness: body.isDefaultPublicBusiness },
      req,
      actor: { id: session.user.id },
    });

    return NextResponse.json({ success: true, business });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
