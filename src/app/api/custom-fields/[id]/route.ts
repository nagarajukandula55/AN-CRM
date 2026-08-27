import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import CustomFieldDefinition, { CUSTOM_FIELD_INPUT_TYPES } from "@/models/CustomFieldDefinition";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

// PATCH /api/custom-fields/[id] — super admin only. Edit label/inputType/options/mandatory/order/isActive.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const session = await getEnrichedSession();
    if (!session?.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "Super admin only" }, { status: 403 });
    }

    await connectDB();
    const { id } = await params;
    const field = await CustomFieldDefinition.findById(id);
    if (!field) return NextResponse.json({ success: false, message: "Field not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    if (body.label !== undefined) field.label = String(body.label).trim();
    if (body.inputType !== undefined && CUSTOM_FIELD_INPUT_TYPES.includes(body.inputType)) field.inputType = body.inputType;
    if (body.options !== undefined && Array.isArray(body.options)) field.options = body.options.map((o: string) => String(o).trim()).filter(Boolean);
    if (body.mandatory !== undefined) field.mandatory = !!body.mandatory;
    if (body.order !== undefined) field.order = Number(body.order) || 0;
    if (body.isActive !== undefined) field.isActive = !!body.isActive;

    if (field.inputType === "SELECT" && field.options.length === 0) {
      return NextResponse.json({ success: false, message: "Dropdown fields need at least one option" }, { status: 400 });
    }

    await field.save();
    return NextResponse.json({ success: true, field });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// DELETE /api/custom-fields/[id] — super admin only. Real delete (it's
// only a field DEFINITION; any values already saved under that key on
// existing documents are harmlessly orphaned, not deleted themselves).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const session = await getEnrichedSession();
    if (!session?.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "Super admin only" }, { status: 403 });
    }

    await connectDB();
    const { id } = await params;
    const field = await CustomFieldDefinition.findById(id);
    if (!field) return NextResponse.json({ success: false, message: "Field not found" }, { status: 404 });

    await CustomFieldDefinition.deleteOne({ _id: id });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
