import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { headers } from "next/headers";
import SalesDocument, { SALES_DOCUMENT_TYPES, type SalesDocumentType } from "@/models/SalesDocument";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { generateDocumentNumber } from "@/core/numbering/numberingService";
import { logAction } from "@/lib/audit/logAction";

// GET /api/sales-documents?businessId=&docType=&status=&search=&page=&limit=
export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    const docType = searchParams.get("docType") as SalesDocumentType | null;
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    if (!businessId) {
      return NextResponse.json({ success: false, message: "businessId is required" }, { status: 400 });
    }
    if (!docType || !SALES_DOCUMENT_TYPES.includes(docType)) {
      return NextResponse.json({ success: false, message: "A valid docType is required" }, { status: 400 });
    }

    const query: Record<string, unknown> = { businessId, docType, isDeleted: false };
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { docNumber: { $regex: search, $options: "i" } },
        { "party.name": { $regex: search, $options: "i" } },
      ];
    }

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25")));

    const [items, total] = await Promise.all([
      SalesDocument.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      SalesDocument.countDocuments(query),
    ]);

    return NextResponse.json({ success: true, data: items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message || "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/sales-documents
export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("sales_documents", "create"));
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id") || session.user.id;

    const body = await req.json();
    const { businessId, docType, party, items, discountAmount, notes, referenceInvoiceId } = body;

    if (!businessId || !docType || !SALES_DOCUMENT_TYPES.includes(docType)) {
      return NextResponse.json({ success: false, message: "businessId and a valid docType are required" }, { status: 400 });
    }
    if (!party?.name?.trim()) {
      return NextResponse.json({ success: false, message: "party.name is required" }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, message: "At least one line item is required" }, { status: 400 });
    }

    const subtotal = items.reduce((s: number, it: any) => s + (it.quantity || 0) * (it.unitPrice || 0), 0);
    const taxTotal = items.reduce(
      (s: number, it: any) => s + (it.quantity || 0) * (it.unitPrice || 0) * ((it.taxRate || 0) / 100),
      0
    );
    const discount = discountAmount || 0;
    const grandTotal = subtotal + taxTotal - discount;

    const { value: docNumber } = await generateDocumentNumber(businessId, docType);

    const doc = await SalesDocument.create({
      businessId,
      docType,
      docNumber,
      party,
      items,
      subtotal,
      taxTotal,
      discountAmount: discount,
      grandTotal,
      referenceInvoiceId: referenceInvoiceId || null,
      notes,
      createdBy: userId,
    });

    logAction({ action: "CREATE", entity: "SalesDocument", entityId: doc._id.toString(), after: doc, req, actor: { id: userId, businessId } });

    return NextResponse.json({ success: true, data: doc }, { status: 201 });
  } catch (err: any) {
    if (err?.code === 11000) {
      return NextResponse.json({ success: false, message: "A document with this number already exists — try again." }, { status: 409 });
    }
    return NextResponse.json({ success: false, message: err.message || "Internal Server Error" }, { status: 500 });
  }
}
