import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Business from "@/models/Business";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { notifyUser } from "@/services/notification.service";

/**
 * PUT /api/businesses/[id]/status — dedicated activate/deactivate toggle.
 * Deliberately separate from PATCH /api/businesses/[id] (whose
 * EDITABLE_FIELDS explicitly excludes isActive, see that file's comment)
 * rather than folding this into the general-purpose edit endpoint — this
 * is the "dedicated, more carefully-guarded flow" that comment already
 * promised but never actually existed: previously the ONLY way to change
 * isActive at all was DELETE (one-way, to false, no way back), so a
 * business deactivated (or created inactive, e.g. the placeholder seed
 * businesses) had no path to ever become active again, and there was no
 * way to deactivate one without permanently soft-deleting it.
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
    // Same super-admin-only guard as DELETE -- activating/deactivating a
    // whole business is not something a regular business-scoped edit
    // permission should grant.
    if (!session.isSuperAdmin) {
      return NextResponse.json(
        { success: false, message: "Only Super Admins can activate or deactivate a business" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    if (typeof body.isActive !== "boolean") {
      return NextResponse.json({ success: false, message: "isActive (boolean) is required" }, { status: 400 });
    }

    const business = await Business.findByIdAndUpdate(
      id,
      { $set: { isActive: body.isActive } },
      { new: true }
    ).lean();
    if (!business) {
      return NextResponse.json({ success: false, message: "Business not found" }, { status: 404 });
    }

    logAction({
      action: "UPDATE",
      entity: "Business",
      entityId: id,
      after: { isActive: body.isActive },
      req,
      actor: { id: session.user.id },
    });

    notifyUser({
      userId: session.user.id,
      title: body.isActive ? "Business activated" : "Business deactivated",
      message: `"${(business as any).name}" was ${body.isActive ? "activated" : "deactivated"}.`,
      type: body.isActive ? "success" : "warning",
    });

    return NextResponse.json({ success: true, business });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
