import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import Customer from "@/models/Customer";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { logAction } from "@/lib/audit/logAction";

function permissionErrorResponse(err: any) {
  return NextResponse.json(
    { success: false, error: err.message },
    { status: err.code === "FORBIDDEN" ? 403 : 401 }
  );
}

// GET /api/customers?businessId=...&search=...
// businessId is optional -- omitted (or by a super admin) returns every
// customer record, matching the "aggregated across all businesses" intent.
export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("customers", "view"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    const search = searchParams.get("search");

    await connectDB();

    const query: Record<string, unknown> = {};
    if (businessId && Types.ObjectId.isValid(businessId)) {
      query.businessId = new Types.ObjectId(businessId);
    }
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const customers = await Customer.find(query).sort({ createdAt: -1 }).limit(500).lean();

    return NextResponse.json({ success: true, customers, total: customers.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/customers -- manual single-record entry.
export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("customers", "create"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    const body = await req.json();
    const { businessId, name, phone, email, address, city, state, pincode, source, notes } = body;

    if (!name?.trim()) {
      return NextResponse.json({ success: false, error: "name is required" }, { status: 400 });
    }

    await connectDB();

    const customer = await Customer.create({
      businessId: businessId && Types.ObjectId.isValid(businessId) ? new Types.ObjectId(businessId) : null,
      name: name.trim(),
      phone: phone?.trim(),
      email: email?.trim(),
      address: address?.trim(),
      city: city?.trim(),
      state: state?.trim(),
      pincode: pincode?.trim(),
      source: source?.trim() || "manual",
      notes: notes?.trim(),
    });

    logAction({
      action: "CREATE",
      entity: "Customer",
      entityId: customer?._id?.toString(),
      after: body,
      req,
      actor: { id: session.user.id },
    });

    return NextResponse.json({ success: true, customer }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
