import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import mongoose from "mongoose";
import JSZip from "jszip";
import SalesInvoice from "@/models/SalesInvoice";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

/* =========================================================
 * GET /api/reports/invoices-zip?from=&to=&businessId=
 *
 * "Download All Invoices (ZIP)" — for businesses that don't use the GST
 * push integration (or just want a local copy), bundle every SalesInvoice
 * issued in [from, to] into a single ZIP: one JSON file per invoice (full
 * record — customer, line items, tax breakdown, e-invoice IRN/ack if
 * filed) plus an index.csv summary. Invoices in this app render as HTML
 * pages rather than stored PDFs (see admin/crm/invoices/[id]/page.tsx's
 * top comment on why no server-side PDF generation exists), so JSON is the
 * durable, lossless per-invoice artifact here — index.csv gives a quick
 * spreadsheet-friendly overview without opening every file.
 * =======================================================*/
export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      requirePermission(session as any, buildPermissionCode("finance", "export"));
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    await connectDB();
    const h = await headers();
    const bizId = h.get("x-active-business-id") || req.nextUrl.searchParams.get("businessId");

    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");
    if (!from || !to) {
      return NextResponse.json({ error: "from and to query params are required" }, { status: 400 });
    }

    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    const filter: any = { issueDate: { $gte: new Date(from), $lte: toDate }, isDeleted: { $ne: true } };
    if (bizId && mongoose.Types.ObjectId.isValid(bizId)) {
      filter.businessId = new mongoose.Types.ObjectId(bizId);
    } else {
      filter.createdBy = new mongoose.Types.ObjectId(session.user.id);
    }

    const invoices = await SalesInvoice.find(filter).sort({ issueDate: 1 }).lean();

    if (invoices.length === 0) {
      return NextResponse.json({ error: "No invoices found in that date range" }, { status: 404 });
    }

    const zip = new JSZip();
    const indexRows = [
      "InvoiceNumber,IssueDate,Customer,GSTIN,Status,Subtotal,TaxTotal,GrandTotal,IRN,EInvoiceStatus",
    ];

    for (const inv of invoices) {
      const safeName = (inv.invoiceNumber || String(inv._id)).replace(/[\\/:*?"<>|]/g, "_");
      zip.file(`${safeName}.json`, JSON.stringify(inv, null, 2));
      indexRows.push(
        [
          inv.invoiceNumber,
          new Date(inv.issueDate).toISOString().slice(0, 10),
          `"${(inv.customer?.name || "").replace(/"/g, '""')}"`,
          inv.customer?.gstin || "",
          inv.status,
          inv.subtotal ?? 0,
          inv.taxTotal ?? 0,
          inv.grandTotal ?? 0,
          inv.irn || "",
          inv.einvoiceStatus || "NOT_FILED",
        ].join(",")
      );
    }

    zip.file("index.csv", indexRows.join("\n"));

    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    logAction({
      action: "READ",
      entity: "InvoiceZipExport",
      entityId: bizId || session.user.id,
      after: { from, to, count: invoices.length },
      req,
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="invoices_${from}_to_${to}.zip"`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
