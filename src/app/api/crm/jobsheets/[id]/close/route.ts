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
import VendorProfile from "@/models/VendorProfile";
import Brand from "@/models/Brand";
import BOM from "@/models/BOM";
import Inventory from "@/models/Inventory";
import { updateInventoryStock } from "@/services/inventory.service";
import { generateScopedDocumentNumber } from "@/core/numbering/numberingService";
import { logAction } from "@/lib/audit/logAction";
import { notify } from "@/lib/notify";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { notifyJobSheetStatusChange } from "@/lib/customerNotify";
import { sendVendorAlert } from "@/core/telegram/sendVendorAlert";
import { categoryRequiresImei, isValidImei } from "@/core/catalog/deviceCategory";
import { round2 } from "@/core/gst/money";

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
    const { supplyType = "INTRASTATE", placeOfSupply, discountAmount = 0, workPerformed, materialsUsed, engineerName } = body;

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

    // Same phone-like-only IMEI gate as start-repair -- a job can slip
    // through to close without ever hitting start-repair (e.g. reopened
    // from REPAIR_STARTED directly), so this is checked again here rather
    // than assumed already enforced.
    if (categoryRequiresImei((jobSheet as any).deviceCategory) && !isValidImei(jobSheet.imeiOrSerialNumber)) {
      return NextResponse.json(
        { success: false, message: "Enter a valid 15-digit IMEI for this device before closing the workorder." },
        { status: 400 }
      );
    }

    // Serialized-inventory stock check + deduction -- only when the
    // business has Business.inventorySerialized = true (see
    // models/Business.ts). Every line item whose BOM part is linked to a
    // real Material (BOM.materialId) must have enough stock
    // in the job sheet's warehouse; deducted only after every check
    // passes, so a mid-batch insufficient-stock failure never leaves a
    // partial deduction behind.
    const business = await Business.findById(jobSheet.businessId).select("compliance inventorySerialized").lean();
    // Per-vendor inventory-serialization + GST-registration status, not the
    // shared Business's -- see VendorProfile's own comment on why these
    // moved off Business (every self-signed-up vendor shares one platform
    // Business, so a Business-level field silently applied to every vendor
    // at once). Falls back to the Business fields for a jobsheet with no
    // vendorId (single-tenant business, no marketplace vendors).
    const vendorSettings = (jobSheet as any).vendorId
      ? await VendorProfile.findById((jobSheet as any).vendorId).select("inventorySerialized gstRegistered gstNumber").lean()
      : null;
    const inventorySerialized = vendorSettings
      ? Boolean((vendorSettings as any).inventorySerialized)
      : Boolean((business as any)?.inventorySerialized);
    const deductions: { materialId: string; quantity: number; partName: string }[] = [];
    if (inventorySerialized) {
      if (!jobSheet.warehouseId) {
        return NextResponse.json(
          { success: false, message: "This business tracks serialized inventory -- assign a Service Center/Warehouse to this job sheet before closing." },
          { status: 400 }
        );
      }
      const bomIds = jobSheet.lineItems.map((item: any) => item.serviceCenterBOMId).filter(Boolean);
      if (bomIds.length > 0) {
        const bomParts = await BOM.find({ _id: { $in: bomIds }, materialId: { $ne: null } })
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

    // GST vs Non-GST is no longer a manual choice or an automatic B2C
    // default -- it's driven ENTIRELY by whether the customer's GSTIN is
    // on file. A GSTIN present means a real B2B GST customer: always
    // taxed at each line's own BOM-decided rate, invoiced on the "INV"
    // series. No GSTIN means the plain "BILL" series -- but still taxed
    // at each line's own rate; nothing here forces tax to zero anymore.
    // Per explicit direction: "0 tax should not apply as we are deciding
    // rate with tax or without tax in bom already... GST only for b2b
    // invoice we will give input and those invoices make user INV series
    // and rest where Customer GST is not there all take under BILL
    // Series."
    // A GST invoice additionally requires the ISSUING vendor/business to
    // actually be GST-registered themselves -- a non-GST-registered
    // vendor legally cannot issue a CGST/SGST/IGST-split invoice no
    // matter what GSTIN the customer supplies. Previously this only
    // checked the customer's GSTIN, so a vendor with no gstNumber of
    // their own could still generate fully-formed GST invoices --
    // reported live as an illegal-invoice risk.
    const issuerGstOk = vendorSettings
      ? Boolean((vendorSettings as any).gstRegistered && (vendorSettings as any).gstNumber)
      : Boolean((business as any)?.compliance?.gstNumber);
    const isB2B = Boolean((jobSheet as any).gstin?.trim()) && issuerGstOk;
    // Per-workorder "Tax Apply" toggle (Parts & Service Lines) -- the one
    // remaining, explicit, per-job override to skip tax entirely (e.g. a
    // genuinely tax-exempt job), left as-is; everything else always uses
    // each line's own BOM-decided taxRate.
    const taxApplyEnabled = (jobSheet as any).taxApplyEnabled !== false;

    /* ── Build invoice items with the same GST-split logic as
       app/api/sales/invoices/route.ts, so CRM-originated invoices are
       structurally identical to manually-created ones. ────────────── */
    let subtotal = 0, cgstTotal = 0, sgstTotal = 0, igstTotal = 0;

    const invoiceItems = jobSheet.lineItems.map((item: any) => {
      const effectiveTaxRate = !taxApplyEnabled ? 0 : (item.taxRate || 0);
      const lineAmt = round2((item.quantity || 1) * (item.unitPrice || 0));
      const totalGST = round2(lineAmt * (effectiveTaxRate / 100));

      let cgstRate = 0, cgstAmount = 0, sgstRate = 0, sgstAmount = 0;
      let igstRate = 0, igstAmount = 0;

      if (supplyType === "INTERSTATE") {
        igstRate = effectiveTaxRate;
        igstAmount = totalGST;
        igstTotal += igstAmount;
      } else {
        cgstRate = effectiveTaxRate / 2;
        sgstRate = cgstRate;
        cgstAmount = round2(totalGST / 2);
        sgstAmount = round2(totalGST / 2);
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
        total: round2(lineAmt + totalGST),
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

    subtotal = round2(subtotal);
    cgstTotal = round2(cgstTotal);
    sgstTotal = round2(sgstTotal);
    igstTotal = round2(igstTotal);
    const taxTotal = round2(cgstTotal + sgstTotal + igstTotal);
    const grandTotal = round2(subtotal + taxTotal - (discountAmount || 0));

    // Exactly two series now, decided purely by isB2B (customer GSTIN on
    // file): the "INV" series (numbering type "INVOICE") for a real B2B
    // GST customer, the "BILL" series (numbering type "NON_GST_INVOICE")
    // for everyone else -- per explicit direction, replacing the previous
    // three-way B2B_INVOICE/INVOICE/NON_GST_INVOICE split.
    //
    // Scoped to this job sheet's own vendor (when it has one) rather than
    // the shared businessId -- a business hosting multiple vendors used to
    // give every vendor the SAME running invoice counter, so vendor B's
    // invoice numbers jumped around based on vendor A's activity and
    // revealed how many invoices the other vendor had issued. Falls back
    // to the businessId-scoped counter for a jobsheet with no vendor
    // (single-tenant business, no marketplace vendors). Same scoped-key
    // pattern already used for vendor product codes/employee codes/BOM
    // codes (see generateScopedDocumentNumber's other call sites) --
    // format/prefix config still comes from the business, only the
    // COUNTER's scope differs.
    const invoiceScopeKey = (jobSheet as any).vendorId
      ? String((jobSheet as any).vendorId)
      : jobSheet.businessId.toString();
    const { value: invoiceNumber } = await generateScopedDocumentNumber(
      invoiceScopeKey,
      isB2B ? "INVOICE" : "NON_GST_INVOICE",
      jobSheet.businessId.toString()
    );

    const invoice = await SalesInvoice.create({
      invoiceNumber,
      businessId: jobSheet.businessId,
      // Never set before -- every per-vendor Telegram report/notification
      // query (lib/telegramReport.ts's computePeriodNumbers) filters
      // SalesInvoice by vendorId to scope revenue to just that vendor's own
      // numbers, so an invoice created here with no vendorId could never
      // match that filter -- revenue always computed to 0 for a per-vendor
      // /today, /report, or scheduled business report even on a day with
      // real closed+paid invoices.
      vendorId: (jobSheet as any).vendorId || undefined,
      createdBy: new mongoose.Types.ObjectId(userId),
      invoiceType: isB2B ? "B2B" : "B2C",
      sourceOrderId: `CRM_JOBSHEET:${jobSheet._id}`,
      linkedJobSheetNumber: jobSheet.jobSheetNumber,
      customer: {
        name: jobSheet.customerName,
        company: (jobSheet as any).company,
        gstin: (jobSheet as any).gstin,
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
      status: "SENT",
    });

    jobSheet.status = "REPAIR_COMPLETED";
    jobSheet.completedAt = jobSheet.completedAt || new Date();
    jobSheet.invoiceId = invoice._id as any;
    jobSheet.invoiceNumber = invoice.invoiceNumber;
    if (workPerformed !== undefined) jobSheet.workPerformed = workPerformed;
    if (materialsUsed !== undefined) jobSheet.materialsUsed = materialsUsed;
    // SC's single-login flow has no formal "assign engineer" step (that's
    // Brand-only -- see assign-engineer/route.ts) -- so the engineer's name
    // is captured as free text right here at close/submit time instead.
    // Only fills in when not already set, so it never clobbers a name
    // already captured via the Brand assign-engineer flow.
    if (engineerName?.trim() && !jobSheet.assignedToName) {
      jobSheet.assignedToName = engineerName.trim();
    }
    await jobSheet.save();

    notifyJobSheetStatusChange(jobSheet.businessId.toString(), jobSheet.phone, jobSheet.jobSheetNumber, jobSheet.status);

    if (jobSheet.vendorId) {
      const closedBrandName = jobSheet.brandId ? (await Brand.findById(jobSheet.brandId).select("name").lean<any>())?.name : jobSheet.pendingBrandName;
      sendVendorAlert(
        jobSheet.vendorId.toString(),
        "WORKORDER_CLOSED",
        `Workorder ${jobSheet.jobSheetNumber} closed and invoiced (${invoice.invoiceNumber}) for ${jobSheet.customerName}.`,
        {
          workorderNumber: jobSheet.jobSheetNumber || "",
          customerName: jobSheet.customerName || "",
          phone: jobSheet.phone || "",
          invoiceNumber: invoice.invoiceNumber || "",
          amount: String(invoice.grandTotal ?? ""),
          product: jobSheet.product || "",
          brand: closedBrandName || "",
          deviceModel: jobSheet.deviceModel || "",
          imei: jobSheet.imeiOrSerialNumber || "",
          issueDescription: jobSheet.issueDescription || "",
          engineerName: jobSheet.assignedToName || "",
          registeredByName: (jobSheet as any).ccoName || "",
          cashCollectedByName: (jobSheet as any).paymentCollectedByName || "",
        }
      ).catch(() => {});
    }

    // Deduct stock now that the invoice is confirmed created -- every
    // check above already passed, so this only fails on a genuine
    // concurrent-request race (rare, and the invoice already exists at
    // that point same as any other stock system).
    for (const d of deductions) {
      await updateInventoryStock({
        businessId: jobSheet.businessId,
        vendorId: (jobSheet as any).vendorId || null,
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
      {
        success: true,
        jobSheet,
        invoice,
        // Surfaces to the UI when a would-be B2B invoice got issued as
        // B2C instead purely because the vendor/business itself has no
        // GST number on file -- so the Owner/Manager understands WHY
        // (and knows to add their GSTIN in Profile/Settings) rather than
        // just seeing an unexpectedly non-GST invoice.
        warning: Boolean((jobSheet as any).gstin?.trim()) && !issuerGstOk
          ? "This customer has a GSTIN, but no GST number is on file for your own business/vendor account, so this was issued as a non-GST bill instead of a GST invoice. Add your GST number in Profile to issue GST invoices."
          : undefined,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("CRM jobsheet close error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
