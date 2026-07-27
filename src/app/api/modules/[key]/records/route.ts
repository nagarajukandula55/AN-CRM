import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/core/db/mongodb";
import {
  createModuleRecord,
  listModuleRecords,
  ModuleRecordValidationError,
} from "@/core/module-registry/moduleRecord.service";
import { logAction } from "@/lib/audit/logAction";

// GET /api/modules/:key/records?businessId=...&limit=...&skip=...
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { key } = await params;
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    if (!businessId) {
      return NextResponse.json({ error: "businessId is required" }, { status: 400 });
    }

    const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined;
    const skip = searchParams.get("skip") ? Number(searchParams.get("skip")) : undefined;

    await connectDB();
    const records = await listModuleRecords(key, businessId, { limit, skip });

    return NextResponse.json({ success: true, records });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/modules/:key/records
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { key } = await params;
    const body = await req.json();
    const { businessId, data } = body;

    if (!businessId || !data) {
      return NextResponse.json(
        { error: "businessId and data are required" },
        { status: 400 }
      );
    }

    await connectDB();
    const record = await createModuleRecord(key, businessId, data, userId);

    logAction({
      action: "CREATE",
      entity: "ModuleRecord",
      entityId: record?._id?.toString(),
      after: data,
      req,
      actor: { businessId },
    });

    return NextResponse.json({ success: true, record }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ModuleRecordValidationError) {
      return NextResponse.json(
        { success: false, error: error.message, fieldErrors: error.errors },
        { status: 422 }
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
