import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { saveTemplate, deleteTemplate } from "@/core/invoiceTemplates/service";
import InvoiceTemplate from "@/models/InvoiceTemplate";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { resolveAuthorizedBusinessId } from "@/lib/auth/resolveAuthorizedBusinessId";
import { logAction } from "@/lib/audit/logAction";

// SECURITY: PUT/DELETE below trusted the record's businessId straight from
// the request (PUT: body.businessId; DELETE: no lookup at all before
// deleting) with no check the caller actually owns it -- any authenticated
// user with the generic settings.edit/delete permission could edit or
// delete another business's invoice template just by knowing/guessing its
// id (or, for PUT, re-tag it under a different businessId entirely).
async function assertOwnsTemplate(template: { businessId: unknown } | null, userId: string, isSuperAdmin: boolean, sessionBusinessId: string | null) {
  if (!template) return false;
  if (isSuperAdmin) return true;
  const authorizedBusinessId = await resolveAuthorizedBusinessId(userId, String(template.businessId), isSuperAdmin, sessionBusinessId);
  return authorizedBusinessId === String(template.businessId);
}

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

    const existing = await InvoiceTemplate.findById(id).lean();
    if (!existing || !(await assertOwnsTemplate(existing as any, session.user.id, !!session.isSuperAdmin, session.business?.businessId || null))) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const body = await req.json();
    const { layoutKey, name, isDefault, branding, text } = body;
    // businessId is NOT taken from the body -- it's the existing, already
    // ownership-verified record's businessId, so a caller can't re-tag a
    // template under a different business by passing a different id here.
    const businessId = String(existing.businessId);

    if (!layoutKey || !name) {
      return NextResponse.json(
        { error: "layoutKey and name are required" },
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

    const existing = await InvoiceTemplate.findById(id).lean();
    if (!existing || !(await assertOwnsTemplate(existing as any, session.user.id, !!session.isSuperAdmin, session.business?.businessId || null))) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

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
