import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { saveTemplate, deleteTemplate } from "@/core/invoiceTemplates/service";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { logAction } from "@/lib/audit/logAction";

/* =========================================================
 * PUT /api/invoice-templates/[id]
 * Update a saved template (including setting it as default — see
 * core/invoiceTemplates/service.ts's saveTemplate() for how the "only
 * one default per business" swap is handled).
 * =======================================================*/
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    requirePermission(session as any, buildPermissionCode("settings", "edit"));

    const { id } = await context.params;
    const body = await req.json();
    const { businessId, layoutKey, name, isDefault, branding, text } = body;

    if (!businessId || !layoutKey || !name) {
      return NextResponse.json(
        { error: "businessId, layoutKey, and name are required" },
        { status: 400 }
      );
    }

    const template = await saveTemplate({ businessId, layoutKey, name, isDefault, branding, text }, id);

    logAction({
      action: "UPDATE",
      entity: "InvoiceTemplate",
      entityId: id,
      after: template,
      req,
      actor: { businessId },
    });

    return NextResponse.json({ success: true, data: template });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/* =========================================================
 * DELETE /api/invoice-templates/[id]
 * =======================================================*/
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    requirePermission(session as any, buildPermissionCode("settings", "delete"));

    const { id } = await context.params;
    await deleteTemplate(id);

    logAction({
      action: "DELETE",
      entity: "InvoiceTemplate",
      entityId: id,
      req,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
