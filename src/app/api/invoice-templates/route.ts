import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { listTemplates, saveTemplate } from "@/core/invoiceTemplates/service";
import { listLayouts } from "@/core/invoiceTemplates/registry";
import type { InvoiceLayout } from "@/core/invoiceTemplates/types";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { logAction } from "@/lib/audit/logAction";

/* =========================================================
 * GET /api/invoice-templates?businessId=
 * List this business's saved template customizations, plus the fixed
 * layout registry (so the picker UI can show layouts with no saved
 * customization yet as "not yet configured" options).
 * =======================================================*/
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    requirePermission(session as any, buildPermissionCode("settings", "view"));

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    if (!businessId) {
      return NextResponse.json({ error: "businessId is required" }, { status: 400 });
    }

    const [templates, layouts] = await Promise.all([
      listTemplates(businessId),
      Promise.resolve(listLayouts().map((l: InvoiceLayout) => ({ key: l.key, label: l.label, description: l.description }))),
    ]);

    return NextResponse.json({ success: true, data: templates, layouts });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/* =========================================================
 * POST /api/invoice-templates
 * Create a new saved template customization.
 * Body: businessId, layoutKey, name, isDefault, branding, text
 * =======================================================*/
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    const session = await getEnrichedSession();
    if (!session?.user || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    requirePermission(session as any, buildPermissionCode("settings", "edit"));

    const body = await req.json();
    const { businessId, layoutKey, name, isDefault, branding, text } = body;

    if (!businessId || !layoutKey || !name) {
      return NextResponse.json(
        { error: "businessId, layoutKey, and name are required" },
        { status: 400 }
      );
    }

    const template = await saveTemplate({ businessId, layoutKey, name, isDefault, branding, text });

    logAction({
      action: "CREATE",
      entity: "InvoiceTemplate",
      entityId: template?._id?.toString(),
      after: template,
      req,
      actor: { id: userId, businessId },
    });

    return NextResponse.json({ success: true, data: template }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
