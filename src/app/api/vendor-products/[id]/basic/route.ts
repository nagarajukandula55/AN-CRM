import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import VendorProduct from "@/models/VendorProduct";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

export async function PATCH(req: Request, context: any) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("vendor_products", "edit"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    await connectDB();

    const body = await req.json();

    // categoryId/brandId are ObjectId refs -- a vendor who hasn't picked
    // one yet submits "" (the <select>'s empty default option), which
    // Mongoose's ObjectId caster rejects outright with a 500, blocking the
    // whole Basic Info step from ever saving. Treat an empty string the
    // same as "not provided" for any ObjectId-shaped field.
    for (const key of ["categoryId", "brandId"]) {
      if (body[key] === "") delete body[key];
    }

    const { id } = await context.params;

    const updated = await VendorProduct.findByIdAndUpdate(
      id,
      body,
      { new: true }
    );

    logAction({
      action: "UPDATE",
      entity: "VendorProduct",
      entityId: id,
      after: body,
      req,
      actor: { businessId: updated?.businessId?.toString() },
    });

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        message: err.message,
      },
      { status: 500 }
    );
  }
}
