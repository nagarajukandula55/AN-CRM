/**
 * GET  /api/crm-option-lists?listType=APPOINTMENT_TYPE|REQUEST_TYPE&businessId=...
 * POST /api/crm-option-lists
 *
 * Super-admin-only write access, per explicit direction ("allow me to
 * configure appointment type / repair type, not users but super admin").
 * Any authenticated user can read the list (needed to populate the New
 * Job Sheet dropdown). Auto-seeds sane defaults the first time each
 * listType is requested and nothing exists yet, so the dropdown is never
 * empty out of the box.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { headers } from "next/headers";
import { Types } from "mongoose";
import CrmOptionList, { type CrmOptionListType } from "@/models/CrmOptionList";
import { logAction } from "@/lib/audit/logAction";

const DEFAULTS: Record<CrmOptionListType, { code: string; label: string }[]> = {
  APPOINTMENT_TYPE: [
    { code: "ONSITE", label: "Onsite" },
    { code: "WALKIN", label: "Walk-in" },
  ],
  REQUEST_TYPE: [
    { code: "REPAIR", label: "Repair" },
    { code: "INSTALLATION", label: "Installation" },
  ],
};

async function ensureSeeded(listType: CrmOptionListType) {
  const count = await CrmOptionList.countDocuments({ listType, businessId: null });
  if (count === 0) {
    await CrmOptionList.insertMany(
      DEFAULTS[listType].map((d, i) => ({ ...d, listType, businessId: null, sortOrder: i, isActive: true }))
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const h = await headers();
    if (!h.get("x-user-id")) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const listType = searchParams.get("listType") as CrmOptionListType | null;
    const businessId = searchParams.get("businessId");

    if (!listType || !DEFAULTS[listType]) {
      return NextResponse.json({ success: false, error: "A valid listType is required" }, { status: 400 });
    }

    await connectDB();
    await ensureSeeded(listType);

    const query: Record<string, unknown> = { listType, isActive: true };
    if (businessId && Types.ObjectId.isValid(businessId)) {
      query.$or = [{ businessId: null }, { businessId }];
    } else {
      query.businessId = null;
    }

    const options = await CrmOptionList.find(query).sort({ sortOrder: 1, label: 1 }).lean();
    return NextResponse.json({ success: true, options });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    const isSuperAdmin = h.get("x-is-super-admin") === "true";
    if (!userId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    if (!isSuperAdmin) {
      return NextResponse.json({ success: false, error: "Super Admin access required" }, { status: 403 });
    }

    const body = await req.json();
    const { listType, code, label, businessId, sortOrder } = body as {
      listType?: string;
      code?: string;
      label?: string;
      businessId?: string;
      sortOrder?: number;
    };

    if (!listType || !(listType in DEFAULTS) || !code?.trim() || !label?.trim()) {
      return NextResponse.json(
        { success: false, error: "listType, code and label are required" },
        { status: 400 }
      );
    }

    await connectDB();

    const option = await CrmOptionList.create({
      listType,
      code: code.trim(),
      label: label.trim(),
      businessId: businessId && Types.ObjectId.isValid(businessId) ? new Types.ObjectId(businessId) : null,
      sortOrder: sortOrder ?? 0,
    });

    logAction({ action: "CREATE", entity: "CrmOptionList", entityId: String(option._id), after: body, req });

    return NextResponse.json({ success: true, option }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("duplicate key") || message.includes("E11000")) {
      return NextResponse.json({ success: false, error: "This code already exists for that list" }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
