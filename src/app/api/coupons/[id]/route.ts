import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import Coupon from "@/models/Coupon";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

// GET /api/coupons/[id]
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("coupons", "view"));
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const { id } = await context.params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid coupon ID" }, { status: 400 });
    }

    await connectDB();

    const coupon = await Coupon.findById(id).populate("applicableBrands", "name").lean();
    if (!coupon) return NextResponse.json({ error: "Coupon not found" }, { status: 404 });

    return NextResponse.json({ success: true, coupon });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT /api/coupons/[id]
// Coupons can only be edited by a Super Admin -- see POST /api/coupons for
// why coupon creation/editing isn't left to business/vendor sessions.
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!session.isSuperAdmin) {
      return NextResponse.json(
        { error: "Only Super Admin can edit coupons" },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid coupon ID" }, { status: 400 });
    }

    const body = await req.json();

    // Prevent overwriting audit fields
    delete body._id;
    delete body.createdBy;
    delete body.usageCount; // managed by redemption logic, not direct edits
    delete body.createdAt;

    if (body.code) body.code = body.code.toUpperCase().trim();

    if (body.discountType && !["PERCENTAGE", "FIXED"].includes(body.discountType)) {
      return NextResponse.json({ error: "Invalid discountType" }, { status: 400 });
    }

    if (
      body.discountType === "PERCENTAGE" &&
      body.discountValue !== undefined &&
      (body.discountValue < 0 || body.discountValue > 100)
    ) {
      return NextResponse.json(
        { error: "Percentage discount must be between 0 and 100" },
        { status: 400 }
      );
    }

    if (body.validFrom) body.validFrom = new Date(body.validFrom);
    if (body.validUntil) body.validUntil = new Date(body.validUntil);

    if (body.applicableProducts) {
      body.applicableProducts = body.applicableProducts.map(
        (pid: string) => new Types.ObjectId(pid)
      );
    }

    if (body.applicableBrands) {
      body.applicableBrands = body.applicableBrands.map(
        (bid: string) => new Types.ObjectId(bid)
      );
    }

    await connectDB();

    const coupon = await Coupon.findByIdAndUpdate(
      id,
      { $set: body },
      { new: true, runValidators: true }
    ).lean();

    if (!coupon) return NextResponse.json({ error: "Coupon not found" }, { status: 404 });

    logAction({
      action: "UPDATE",
      entity: "Coupon",
      entityId: id,
      after: body,
      req,
      actor: { id: session.user.id },
    });

    return NextResponse.json({ success: true, coupon });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("duplicate key") || message.includes("E11000")) {
      return NextResponse.json(
        { success: false, error: "A coupon with this code already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE /api/coupons/[id]
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!session.isSuperAdmin) {
      return NextResponse.json(
        { error: "Only Super Admin can delete coupons" },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid coupon ID" }, { status: 400 });
    }

    await connectDB();

    const coupon = await Coupon.findByIdAndDelete(id).lean();
    if (!coupon) return NextResponse.json({ error: "Coupon not found" }, { status: 404 });

    logAction({
      action: "DELETE",
      entity: "Coupon",
      entityId: id,
      req,
      actor: { id: session.user.id },
    });

    return NextResponse.json({ success: true, message: "Coupon deleted" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
