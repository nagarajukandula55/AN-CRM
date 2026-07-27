import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { listTemplates, createTemplate } from "@/core/documentTemplates/service";
import { BLOCK_PALETTE } from "@/core/documentTemplates/blockPalette";
import { DOCUMENT_TEMPLATE_TYPES, type DocumentTemplateType } from "@/models/DocumentTemplate";
import { logAction } from "@/lib/audit/logAction";

/* =========================================================
 * GET /api/document-templates?businessId=&documentType=
 * List saved drag-and-drop templates for a business, optionally filtered
 * to one document type. Also returns the block palette + supported
 * document types so the builder UI doesn't need a second round trip.
 * =======================================================*/
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId") || h.get("x-active-business-id");
    const documentType = searchParams.get("documentType") || undefined;

    if (!businessId) {
      return NextResponse.json({ success: false, error: "businessId is required" }, { status: 400 });
    }

    const templates = await listTemplates(businessId, documentType);

    return NextResponse.json({
      success: true,
      data: templates,
      templates,
      documentTypes: DOCUMENT_TEMPLATE_TYPES,
      blockPalette: BLOCK_PALETTE,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/* =========================================================
 * POST /api/document-templates
 * Create a new drag-and-drop template.
 * Body: businessId, documentType, name, blocks?, accentColor?, logoUrl?, isDefault?
 * =======================================================*/
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const businessId = body.businessId || h.get("x-active-business-id");
    const { documentType, name, blocks, accentColor, logoUrl, isDefault } = body;

    if (!businessId) {
      return NextResponse.json({ success: false, error: "businessId is required" }, { status: 400 });
    }
    if (!documentType || !DOCUMENT_TEMPLATE_TYPES.includes(documentType as DocumentTemplateType)) {
      return NextResponse.json(
        { success: false, error: `documentType must be one of: ${DOCUMENT_TEMPLATE_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (!name || !String(name).trim()) {
      return NextResponse.json({ success: false, error: "name is required" }, { status: 400 });
    }

    const template = await createTemplate({
      businessId,
      documentType,
      name: String(name).trim(),
      blocks,
      accentColor,
      logoUrl,
      isDefault,
    });

    logAction({
      action: "CREATE",
      entity: "DocumentTemplate",
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
