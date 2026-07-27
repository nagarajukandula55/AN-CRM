import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import Customer from "@/models/Customer";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { logAction } from "@/lib/audit/logAction";

/**
 * POST /api/customers/upload -- CSV bulk import (multipart/form-data,
 * field "file", optional field "businessId"). Additive: unlike the pincode
 * dataset (a single authoritative dataset replaced wholesale on upload),
 * customer data accumulates from multiple sources over time, so existing
 * records are never deleted here.
 *
 * Expected columns: name,phone,email,address,city,state,pincode
 */
function permissionErrorResponse(err: any) {
  return NextResponse.json(
    { success: false, error: err.message },
    { status: err.code === "FORBIDDEN" ? 403 : 401 }
  );
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (cells[i] || "").trim(); });
    return row;
  });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("customers", "create"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const businessId = formData.get("businessId") as string | null;

    if (!file) {
      return NextResponse.json({ success: false, error: "No file uploaded" }, { status: 400 });
    }
    const isCsv = file.type === "text/csv" || file.type === "application/vnd.ms-excel" || file.name.toLowerCase().endsWith(".csv");
    if (!isCsv) {
      return NextResponse.json({ success: false, error: "Please upload a .csv file" }, { status: 400 });
    }

    const MAX_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ success: false, error: "File is too large (max 10MB)" }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseCsv(text);
    const validRows = rows.filter((r) => r.name?.trim());

    if (validRows.length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid rows found -- the file needs at least a 'name' column" },
        { status: 400 }
      );
    }

    await connectDB();

    const docs = validRows.map((r) => ({
      businessId: businessId && Types.ObjectId.isValid(businessId) ? new Types.ObjectId(businessId) : null,
      name: r.name,
      phone: r.phone || undefined,
      email: r.email || undefined,
      address: r.address || undefined,
      city: r.city || undefined,
      state: r.state || undefined,
      pincode: r.pincode || undefined,
      source: file.name,
    }));

    const inserted = await Customer.insertMany(docs, { ordered: false });

    logAction({
      action: "CREATE",
      entity: "Customer",
      entityId: "bulk-upload",
      after: { count: inserted.length, sourceFileName: file.name },
      req,
      actor: { id: session.user.id },
    });

    return NextResponse.json({ success: true, imported: inserted.length, totalRows: rows.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
