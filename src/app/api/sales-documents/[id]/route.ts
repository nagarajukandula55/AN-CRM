import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import SalesDocument from "@/models/SalesDocument";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { logAction } from "@/lib/audit/logAction";
import { resolveAuthorizedBusinessId } from "@/lib/auth/resolveAuthorizedBusinessId";

// SECURITY: GET/PUT/DELETE below looked a document up by its Mongo _id
// ONLY -- no check that its businessId belongs to the caller at all, so
// any authenticated user holding the generic sales_documents.view/edit/
// delete permission could read, change the status of, or soft-delete
// another business's sales document just by knowing (or guessing/
// enumerating) its id. Every handler now verifies the document's own
// businessId against the caller's real, resolved business before doing
// anything with it.
async function assertOwnsDocument(doc: { businessId: unknown } | null, userId: string, isSuperAdmin: boolean, sessionBusinessId: string | null) {
  if (!doc) return false;
  if (isSuperAdmin) return true;
  const authorizedBusinessId = await resolveAuthorizedBusinessId(userId, String(doc.businessId), isSuperAdmin, sessionBusinessId);
  return authorizedBusinessId === String(doc.businessId);
}

// GET /api/sales-documents/[id]
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("sales_documents", "view"));
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    await connectDB();
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 });
    }

    const doc = await SalesDocument.findOne({ _id: id, isDeleted: false }).lean();
    if (!doc || !(await assertOwnsDocument(doc as any, session.user.id, !!session.isSuperAdmin, session.business?.businessId || null))) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: doc });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message || "Internal Server Error" }, { status: 500 });
  }
}

// PUT /api/sales-documents/[id] — status changes only (DRAFT -> SENT ->
// ACCEPTED/REJECTED/CANCELLED); line items are immutable once created,
// same as an invoice, so a mistake means cancel-and-recreate, not edit.
export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("sales_documents", "edit"));
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    await connectDB();
    const { id } = await context.params;
    const body = await req.json();

    const existing = await SalesDocument.findOne({ _id: id, isDeleted: false }).lean();
    if (!existing || !(await assertOwnsDocument(existing as any, session.user.id, !!session.isSuperAdmin, session.business?.businessId || null))) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }

    const doc = await SalesDocument.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: { status: body.status, notes: body.notes } },
      { new: true }
    );

    logAction({ action: "UPDATE", entity: "SalesDocument", entityId: id, after: doc, req });

    return NextResponse.json({ success: true, data: doc });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message || "Internal Server Error" }, { status: 500 });
  }
}

// DELETE /api/sales-documents/[id] — soft delete.
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("sales_documents", "delete"));
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    await connectDB();
    const { id } = await context.params;

    const existing = await SalesDocument.findOne({ _id: id, isDeleted: false }).lean();
    if (!existing || !(await assertOwnsDocument(existing as any, session.user.id, !!session.isSuperAdmin, session.business?.businessId || null))) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }

    await SalesDocument.findOneAndUpdate({ _id: id, isDeleted: false }, { $set: { isDeleted: true } }, { new: true });

    logAction({ action: "DELETE", entity: "SalesDocument", entityId: id, req });

    return NextResponse.json({ success: true, message: "Deleted" });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message || "Internal Server Error" }, { status: 500 });
  }
}
