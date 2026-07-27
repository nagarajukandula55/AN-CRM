import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import InventoryItem from "@/models/InventoryItem";
import { logAction } from "@/lib/audit/logAction";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: Ctx) {
  try {
    await connectDB();
    const { id } = await context.params;
    const item = await InventoryItem.findById(id).lean();
    if (!item) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, item });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, context: Ctx) {
  try {
    const h = await headers();
    if (!h.get("x-user-id")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const { id } = await context.params;
    const body = await req.json();

    const item = await InventoryItem.findByIdAndUpdate(
      id,
      { $set: body },
      { new: true, runValidators: false }
    ).lean();

    logAction({
      action: "UPDATE",
      entity: "InventoryItem",
      entityId: id,
      after: body,
      req,
    });

    return NextResponse.json({ success: true, item });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: Ctx) {
  try {
    const h = await headers();
    if (!h.get("x-user-id")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const { id } = await context.params;
    await InventoryItem.findByIdAndDelete(id);

    logAction({
      action: "DELETE",
      entity: "InventoryItem",
      entityId: id,
      req,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
