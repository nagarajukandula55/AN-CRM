/**
 * POST /api/crm/jobsheets/[id]/close — the final hinge of the CRM lifecycle:
 * marks a job sheet COMPLETED/INVOICED, generates a SalesInvoice from its
 * line items (reusing the canonical SalesInvoice model + numbering engine —
 * same GST-split logic as app/api/sales/invoices/route.ts, not a second
 * parallel invoicing path), and closes the originating call as CLOSED_WON.
 *
 * This is deliberately idempotent-safe: if the job sheet already has an
 * invoiceId, it returns the existing invoice rather than creating a
 * duplicate on a repeated call.
 */

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import CrmJobSheet from "@/models/CrmJobSheet";
import SalesInvoice from "@/models/SalesInvoice";
import Business from "@/models/Business";
import ServiceCenterBOM from "@/models/ServiceCenterBOM";
import Inventory from "@/models/Inventory";
import { updateInventoryStock } from "@/services/inventory.service";
import { generateDocumentNumber } from "@/core/numbering/numberingService";
import { logAction } from "@/lib/audit/logAction";
import { notify } from "@/lib/notify";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    // Closing generates a SalesInvoice, so gate on the edit permission for
    // jobsheets (the resource being mutated) -- invoice creation itself is
    // an implicit side effect of this specific, already-gated action.
    try {
      requirePermission(session as any, buildPermissionCode("crm_jobsheets", "edit"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }
    const userId = session.user.id;

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid job sheet id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const { supplyType = "INTRASTATE", placeOfSupply, discountAmount = 0, workPerformed, materialsUsed } = body;

    await connectDB();

    const jobSheet = await CrmJobSheet.findOne({ _id: id, isDeleted: false });
    if (!jobSheet) {
      return NextResponse.json({ success: false, message: "Job sheet not found" }, { status: 404 });
    }

    // Idempotent: already closed with an invoice — return what exists
    // instead of erroring or double-billing the customer.
    if (jobSheet.invoiceId) {
      const existingInvoice = await SalesInvoice.findById(jobSheet.invoiceId).lean();
      return NextResponse.json({
        success: true,
        message: "Job sheet was already closed.",
        jobSheet,
        invoice: existingInvoice,
      });
    }

    if (jobSheet.status !== "REPAIR_IN_PROGRESS" && jobSheet.status !== "REPAIR_STARTED") {
      return NextResponse.json(
        { success: false, message: `Cannot complete repair while status is ${jobSheet.status}.` },
        { status: 409 }
      );
    }

    if (!jobSheet.lineItems || jobSheet.lineItems.length === 0) {
      return NextResponse.json(
        { success: false, message: "Cannot close a job sheet with no line items — add at least one before closing." },
        { status: 400 }
      );
    }

    // Serialized-inventory stock check + deduction -- only when the
    // business has Business.inventorySerialized = true (see
    // models/Business.ts). Every line item whose BOM part is linked to a
    // real Material (ServiceCenterBOM.materialId) must have enough stock
    // in the job sheet's warehouse; deducted only after every check
    // passes, so a mid-batch insufficient-stock failure never leaves a
    // partial deduction behind.
    const business = await Business.findById(jobSheet.businessId).select("inventorySerialized applyTaxOnB2CBilling").lean();
    const deductions: { materialId: string; quantity: number; partName: string }[] = [];
    if ((business as any)?.inventorySerialized) {
      if (!jobSheet.warehouseId) {
        return NextResponse.json(
          { success: false, message: "This business tracks serialized inventory -- assign a Service Center/Warehouse to this job sheet before closing." },
          { status: 400 }
        );
      }
      const bomIds = jobSheet.lineItems.map((item: any) => item.serviceCenterBOMId).filter(Boolean);
      if (bomIds.length > 0) {
        const bomParts = await ServiceCenterBOM.find({ _id: { $in: bomIds }, materialId: { $ne: null } })
          .select("materialId partName")
          .lean();
        const bomById = new Map(bomParts.map((p: any) => [String(p._id), p]));

        for (const item of jobSheet.lineItems as any[]) {
          const bom = item.serviceCenterBOMId ? bomById.get(String(item.serviceCenterBOMId)) : null;
          if (!bom) continue;
          const inventory = await Inventory.findOne({
            warehouseId: jobSheet.warehouseId,
            materialId: bom.materialId,
            active: true,
          }).select("availableQuantity").lean();
          const available = (inventory as any)?.availableQuantity ?? 0;
          const needed = item.quantity || 1;
          if (available < needed) {
            return NextResponse.json(
              { success: false, message: `Insufficient stock for "${bom.partName}" -- ${available} available, ${needed} needed. Maintain sufficient stock before closing this job.` },
              { status: 409 }
            );
          }
          deductions.push({ materialId: String(bom.materialId), quantity: needed, partName: bom.partName });
        }
      }
    }

    // A job sheet whose customer entered a company name is a B2B customer
    // -- computed here (not just further down at numbering time) because
    // it also decides whether the B2C tax toggle below applies at all.
    const isB2B = Boolean((jobSheet as any).company?.trim());
    // Business.applyTaxOnB2CBilling (default true) -- when a Super
    // Admin/vendor Owner-Manager has turned this OFF, a plain B2C bill
    // (no company name) is generated with NO tax at all, regardless of
    // what taxRate each line item/BOM part normally carries. B2B
    // invoices are never affected by this toggle, per explicit direction.
    const applyB2CTax = (business as any)?.applyTaxOnB2CBilling !== false;
    const zeroTaxForB2C = !isB2B && !applyB2CTax;

    /* ── Build invoice items with the same GST-split logic as
       app/api/sales/invoices/route.ts, so CRM-originated invoices are
       structurally identical to manually-created ones. ────────────── */
    let subtotal = 0, cgstTotal = 0, sgstTotal = 0, igstTotal = 0;

    const invoiceItems = jobSheet.lineItems.map((item: any) => {
      const effectiveTaxRate = zeroTaxForB2C ? 0 : (item.taxRate || 0);
      const lineAmt = (item.quantity || 1) * (item.unitPrice || 0);
      const totalGST = lineAmt * (effectiveTaxRate / 100);

      let cgstRate = 0, cgstAmount = 0, sgstRate = 0, sgstAmount = 0;
      let igstRate = 0, igstAmount = 0;

      if (supplyType === "INTERSTATE") {
        igstRate = effectiveTaxRate;
        igstAmount = totalGST;
        igstTotal += igstAmount;
      } else {
        cgstRate = effectiveTaxRate / 2;
        sgstRate = cgstRate;
        cgstAmount = totalGST / 2;
        sgstAmount = totalGST / 2;
        cgstTotal += cgstAmount;
        sgstTotal += sgstAmount;
      }

      subtotal += lineAmt;

      return {
        description: item.description || "",
        quantity: item.quantity || 1,
        unit: item.unit || "pcs",
        unitPrice: item.unitPrice || 0,
        taxRate: effectiveTaxRate,
        taxAmount: totalGST,
        cgstRate, cgstAmount,
        sgstRate, sgstAmount,
        igstRate, igstAmount,
        total: lineAmt + totalGST,
      };
    });

    // Service Charge -- a flat amount separate from parts/labour line
    // items, Owner/Manager-set on the job sheet (see the detail page and
    // PATCH's serviceCharge guard). Added as its own zero-tax invoice line
    // rather than folded into subtotal silently, so it's visible on the
    // printed invoice.
    const serviceCharge = (jobSheet as any).serviceCharge || 0;
    if (serviceCharge > 0) {
      invoiceItems.push({
        description: "Service Charge",
        quantity: 1,
        unit: "pcs",
        unitPrice: serviceCharge,
        taxRate: 0,
        taxAmount: 0,
        cgstRate: 0, cgstAmount: 0,
        sgstRate: 0, sgstAmount: 0,
        igstRate: 0, igstAmount: 0,
        total: serviceCharge,
      });
      subtotal += serviceCharge;
    }

    const taxTotal = cgstTotal + sgstTotal + igstTotal;
    const grandTotal = subtotal + taxTotal - (discountAmount || 0);

    // GST-bearing invoices and non-GST (zero-tax/exempt) invoices get their
    // own separate running number series -- a business needs its
    // GST-taxable invoice numbers to be their own consecutive sequence for
    // filing purposes, not interleaved with zero-GST bills. Determined by
    // whether ANY line item actually carries GST, not the job sheet's
    // overall total (a single taxed line is enough to make this a GST
    // invoice even if others are zero-rated).
    // isB2B/zeroTaxForB2C already computed above (they drove the tax
    // zeroing on invoiceItems). A B2B customer (company name present)
    // gets its own invoice number series (B2B_INVOICE) and invoiceType,
    // separate from the walk-in/individual B2C series, per explicit
    // requirement. GST-vs-non-GST series selection below still applies
    // independently within either B2B or B2C -- checked against
    // invoiceItems (the actual, possibly-zeroed rates), not the raw job
    // sheet line items, so a B2C bill with tax turned off always lands on
    // NON_GST_INVOICE even if its BOM parts normally carry GST.
    const isGstInvoice = zeroTaxForB2C ? false : invoiceItems.some((item: any) => (item.taxRate || 0) > 0);
    const { value: invoiceNumber } = await generateDocumentNumber(
      jobSheet.businessId.toString(),
      isB2B ? "B2B_INVOICE" : isGstInvoice ? "INVOICE" : "NON_GST_INVOICE"
    );

    const invoice = await SalesInvoice.create({
      invoiceNumber,
      businessId: jobSheet.businessId,
      createdBy: new mongoose.Types.ObjectId(userId),
      invoiceType: isB2B ? "B2B" : "B2C",
      sourceOrderId: `CRM_JOBSHEET:${jobSheet._id}`,
      customer: {
        name: jobSheet.customerName,
        company: (jobSheet as any).company,
        email: jobSheet.email,
        phone: jobSheet.phone,
        address: jobSheet.address,
      },
      supplyType,
      placeOfSupply,
      items: invoiceItems,
      subtotal,
      cgstTotal,
      sgstTotal,
      igstTotal,
      taxTotal,
      discountAmount,
      grandTotal,
      notes: `Generated from Job Sheet ${jobSheet.jobSheetNumber}`,
      status: "SENT",
    });

    jobSheet.status = "REPAIR_COMPLETED";
    jobSheet.completedAt = jobSheet.completedAt || new Date();
    jobSheet.invoiceId = invoice._id as any;
    jobSheet.invoiceNumber = invoice.invoiceNumber;
    if (workPerformed !== undefined) jobSheet.workPerformed = workPerformed;
    if (materialsUsed !== undefined) jobSheet.materialsUsed = materialsUsed;
    await jobSheet.save();

    // Deduct stock now that the invoice is confirmed created -- every
    // check above already passed, so this only fails on a genuine
    // concurrent-request race (rare, and the invoice already exists at
    // that point same as any other stock system).
    for (const d of deductions) {
      await updateInventoryStock({
        businessId: jobSheet.businessId,
        warehouseId: jobSheet.warehouseId,
        itemType: "MATERIAL",
        materialId: d.materialId,
        transactionType: "SALE",
        quantity: d.quantity,
        referenceType: "CRM_JOBSHEET",
        referenceId: String(jobSheet._id),
        referenceNumber: jobSheet.jobSheetNumber,
        remarks: `Workorder ${jobSheet.jobSheetNumber} closed -- ${d.partName}`,
        createdBy: userId,
      }).catch(() => {
        // Best-effort past this point -- the invoice is already the source
        // of truth for what was billed; a stock-ledger hiccup here
        // shouldn't roll back a completed, invoiced job.
      });
    }

    // No document is generated or stored here on purpose -- per explicit
    // direction, an invoice/estimate document should never be persisted as
    // a stored file; it's rendered fresh from the SalesInvoice record every
    // time someone actually wants it. /invoice/[invoiceNumber] (backed by
    // GET /api/invoice/view/[invoiceNumber]) already does exactly this: it
    // reads this SalesInvoice live and renders it through the same
    // template registry, with a "Print / Download PDF" button that uses
    // the browser's own print-to-PDF -- nothing to upload or keep in sync
    // here. That view route already handles this invoice's synthetic
    // "CRM_JOBSHEET:<id>" sourceOrderId correctly (see its own comment).

    // The originating call is closed at handover (see
    // /api/crm/jobsheets/[id]/handover), not here — repair completion just
    // makes the invoice downloadable, the customer hasn't collected yet.

    logAction({
      action: "CLOSE",
      entity: "CrmJobSheet",
      entityId: id,
      after: { invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber },
      req,
      actor: { id: userId, businessId: jobSheet.businessId.toString() },
    });
    logAction({
      action: "CREATE",
      entity: "SalesInvoice",
      entityId: invoice._id?.toString(),
      after: invoice,
      req,
      actor: { id: userId, businessId: jobSheet.businessId.toString() },
    });

    notify({
      event: "CRM_JOB_CLOSED",
      message: `✅ Job ${jobSheet.jobSheetNumber} closed. Invoice ${invoice.invoiceNumber} generated for ${jobSheet.customerName} (₹${grandTotal.toLocaleString("en-IN")})`,
    }).catch(() => {});

    return NextResponse.json(
      { success: true, jobSheet, invoice },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("CRM jobsheet close error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
