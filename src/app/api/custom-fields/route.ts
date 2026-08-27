import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import CustomFieldDefinition, { CUSTOM_FIELD_FORMS, CUSTOM_FIELD_INPUT_TYPES } from "@/models/CustomFieldDefinition";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "field";
}

/**
 * GET /api/custom-fields?formKey=JOBSHEET — the platform-wide field list
 * for this form. Super-admin-managed only (per explicit direction: "this
 * should be only for super admin not for vendors") -- every vendor using
 * the form sees the same fields, no per-vendor customization.
 */
export async function GET(req: NextRequest) {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const formKey = searchParams.get("formKey");
    if (!formKey || !CUSTOM_FIELD_FORMS.includes(formKey as any)) {
      return NextResponse.json({ success: false, message: "A valid formKey is required" }, { status: 400 });
    }

    await connectDB();
    const fields = await CustomFieldDefinition.find({ formKey, isActive: true }).sort({ order: 1, createdAt: 1 }).lean();

    return NextResponse.json({ success: true, fields });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// POST /api/custom-fields — super admin only, defines a new platform-wide field on a form.
export async function POST(req: NextRequest) {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const session = await getEnrichedSession();
    if (!session?.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "Super admin only" }, { status: 403 });
    }

    await connectDB();

    const body = await req.json().catch(() => ({}));
    const { formKey, label, inputType, options, mandatory } = body;

    if (!formKey || !CUSTOM_FIELD_FORMS.includes(formKey)) {
      return NextResponse.json({ success: false, message: "A valid formKey is required" }, { status: 400 });
    }
    if (!label || !String(label).trim()) {
      return NextResponse.json({ success: false, message: "A label is required" }, { status: 400 });
    }
    const resolvedInputType = CUSTOM_FIELD_INPUT_TYPES.includes(inputType) ? inputType : "TEXT";
    if (resolvedInputType === "SELECT" && (!Array.isArray(options) || options.filter((o: string) => o?.trim()).length === 0)) {
      return NextResponse.json({ success: false, message: "Dropdown fields need at least one option" }, { status: 400 });
    }

    const businessId = session.business?.businessId;
    if (!businessId) {
      return NextResponse.json({ success: false, message: "No business context resolved" }, { status: 400 });
    }

    const fieldKey = slugify(label);
    const existing = await CustomFieldDefinition.findOne({ businessId, vendorId: null, formKey, fieldKey });
    if (existing) {
      return NextResponse.json({ success: false, message: "A field with this name already exists on this form" }, { status: 409 });
    }

    const maxOrder = await CustomFieldDefinition.findOne({ businessId, vendorId: null, formKey }).sort({ order: -1 }).select("order").lean();

    const field = await CustomFieldDefinition.create({
      businessId,
      vendorId: null,
      formKey,
      fieldKey,
      label: String(label).trim(),
      inputType: resolvedInputType,
      options: resolvedInputType === "SELECT" ? options.map((o: string) => o.trim()).filter(Boolean) : [],
      mandatory: !!mandatory,
      order: ((maxOrder as any)?.order ?? -1) + 1,
      createdBy: userId,
    });

    return NextResponse.json({ success: true, field });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
