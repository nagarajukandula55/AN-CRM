import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import Unit from "@/models/Unit";
import { logAction } from "@/lib/audit/logAction";

// GET /api/masters/units/[id]
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid unit id" }, { status: 400 });
    }

    await connectDB();

    const unit = await Unit.findOne({ _id: id, isDeleted: false }).lean();
    if (!unit) return NextResponse.json({ error: "Unit not found" }, { status: 404 });

    return NextResponse.json({ success: true, data: unit });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT /api/masters/units/[id]
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid unit id" }, { status: 400 });
    }

    const body = await req.json();
    const { name, symbol, description, type, isActive } = body;

    await connectDB();

    const unit = await Unit.findOne({ _id: id, isDeleted: false });
    if (!unit) return NextResponse.json({ error: "Unit not found" }, { status: 404 });

    // Check for duplicate name (excluding this unit)
    if (name && name.trim() !== unit.name) {
      const duplicate = await Unit.findOne({
        businessId: unit.businessId,
        name: { $regex: `^${name.trim()}$`, $options: "i" },
        isDeleted: false,
        _id: { $ne: id },
      });
      if (duplicate) {
        return NextResponse.json({ error: "A unit with this name already exists" }, { status: 409 });
      }
    }

    if (name !== undefined) unit.name = name.trim();
    if (symbol !== undefined) unit.symbol = symbol.trim();
    if (description !== undefined) unit.description = description?.trim();
    if (type !== undefined) unit.type = type;
    if (isActive !== undefined) unit.isActive = isActive;

    await unit.save();

    logAction({
      action: "UPDATE",
      entity: "Unit",
      entityId: id,
      after: unit,
      req,
    });

    return NextResponse.json({ success: true, data: unit });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE /api/masters/units/[id]
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid unit id" }, { status: 400 });
    }

    await connectDB();

    const unit = await Unit.findOne({ _id: id, isDeleted: false });
    if (!unit) return NextResponse.json({ error: "Unit not found" }, { status: 404 });

    // Soft delete
    unit.isDeleted = true;
    unit.isActive = false;
    await unit.save();

    logAction({
      action: "DELETE",
      entity: "Unit",
      entityId: id,
      req,
    });

    return NextResponse.json({ success: true, message: "Unit deleted successfully" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
