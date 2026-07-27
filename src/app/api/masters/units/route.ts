import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import Unit from "@/models/Unit";
import { logAction } from "@/lib/audit/logAction";

// GET /api/masters/units?businessId=xxx
export async function GET(req: NextRequest) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    if (!businessId) return NextResponse.json({ error: "businessId is required" }, { status: 400 });

    await connectDB();

    const filter: Record<string, unknown> = {
      businessId: new Types.ObjectId(businessId),
      isDeleted: false,
    };

    const type = searchParams.get("type");
    if (type) filter.type = type;

    const isActive = searchParams.get("isActive");
    if (isActive !== null) filter.isActive = isActive === "true";

    const search = searchParams.get("search");
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { symbol: { $regex: search, $options: "i" } },
      ];
    }

    const units = await Unit.find(filter).sort({ name: 1 }).lean();

    return NextResponse.json({ success: true, data: units });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/masters/units
export async function POST(req: NextRequest) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { businessId, name, symbol, description, type } = body;

    if (!businessId) return NextResponse.json({ error: "businessId is required" }, { status: 400 });
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    if (!symbol) return NextResponse.json({ error: "symbol is required" }, { status: 400 });

    await connectDB();

    // Check for duplicate name within business
    const existing = await Unit.findOne({
      businessId: new Types.ObjectId(businessId),
      name: { $regex: `^${name}$`, $options: "i" },
      isDeleted: false,
    });
    if (existing) {
      return NextResponse.json({ error: "A unit with this name already exists" }, { status: 409 });
    }

    const unit = await Unit.create({
      businessId: new Types.ObjectId(businessId),
      name: name.trim(),
      symbol: symbol.trim(),
      description: description?.trim(),
      type: type || "other",
      createdBy: new Types.ObjectId(userId),
    });

    logAction({
      action: "CREATE",
      entity: "Unit",
      entityId: unit?._id?.toString(),
      after: unit,
      req,
    });

    return NextResponse.json({ success: true, data: unit }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
