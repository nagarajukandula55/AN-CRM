import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { getTemplate, updateTemplate, deleteTemplate } from "@/core/documentTemplates/service";
import { logAction } from "@/lib/audit/logAction";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const h = await headers();
    if (!h.get("x-user-id")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const template = await getTemplate(id);
    if (!template) {
      return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: template });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const body = await req.json();
    const { name, blocks, accentColor, logoUrl, isDefault } = body;

    const updated = await updateTemplate(id, { name, blocks, accentColor, logoUrl, isDefault });
    if (!updated) {
      return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
    }

    logAction({
      action: "UPDATE",
      entity: "DocumentTemplate",
      entityId: id,
      after: updated,
      req,
      actor: { id: userId },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const deleted = await deleteTemplate(id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
    }

    logAction({
      action: "DELETE",
      entity: "DocumentTemplate",
      entityId: id,
      before: deleted,
      req,
      actor: { id: userId },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
