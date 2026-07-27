/**
 * GST filing service — the business-logic layer between API routes/ANu and
 * the GstFiling/GstPortalConfig models + the pushToPortal() adapter.
 *
 * Kept separate from the route file (same pattern as numberingService.ts,
 * anuService.ts) so both the HTTP route and ANu's tool-calling can share
 * one implementation instead of the route owning logic ANu would otherwise
 * have to duplicate.
 */

import { Types } from "mongoose";
import GstFiling, { IGstFiling } from "@/models/GstFiling";
import GstPortalConfig from "@/models/GstPortalConfig";
import SalesInvoice from "@/models/SalesInvoice";
import { pushToPortal } from "./gstPortalAdapter";

export interface QueueFilingInput {
  businessId: string;
  invoiceId: string;
  returnType: "GSTR1" | "GSTR3B" | "IFF";
  period: string;
  submittedBy?: string;
}

/**
 * Create a PENDING GstFiling row for an invoice, or return the existing one
 * for the same (invoiceId, returnType, period) if already queued — avoids
 * duplicate filings for the same invoice/period/return-type combination.
 */
export async function queueFiling(input: QueueFilingInput): Promise<IGstFiling> {
  const existing = await GstFiling.findOne({
    invoiceId: new Types.ObjectId(input.invoiceId),
    returnType: input.returnType,
    period: input.period,
  });
  if (existing) return existing;

  const invoice = await SalesInvoice.findById(input.invoiceId).lean();
  if (!invoice) {
    throw new Error(`Invoice ${input.invoiceId} not found`);
  }

  return GstFiling.create({
    businessId: new Types.ObjectId(input.businessId),
    invoiceId: new Types.ObjectId(input.invoiceId),
    invoiceNumber: invoice.invoiceNumber,
    returnType: input.returnType,
    period: input.period,
    status: "PENDING",
    submittedBy: input.submittedBy,
  });
}

/**
 * Push a PENDING (or previously FAILED) filing to the portal via the
 * adapter, updating status/portal reference/response payload accordingly.
 */
export async function submitFiling(filingId: string): Promise<IGstFiling> {
  const filing = await GstFiling.findById(filingId);
  if (!filing) throw new Error(`GST filing ${filingId} not found`);

  const config = await GstPortalConfig.findOne({ businessId: filing.businessId });
  if (!config) {
    throw new Error("No GST portal configuration found for this business. Configure it in Settings > GST Filing.");
  }

  const invoice = await SalesInvoice.findById(filing.invoiceId).lean();
  if (!invoice) throw new Error(`Invoice ${filing.invoiceId} not found`);

  const result = await pushToPortal(config, {
    businessId: filing.businessId.toString(),
    gstin: config.gstin,
    returnType: filing.returnType,
    period: filing.period,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: (invoice.issueDate ?? invoice.createdAt).toISOString(),
    supplyType: invoice.supplyType,
    customerGstin: invoice.customer?.gstin,
    customerName: invoice.customer?.name,
    customerAddress: invoice.customer?.address,
    customerStateCode: invoice.customer?.stateCode,
    placeOfSupply: invoice.placeOfSupply,
    items: (invoice.items || []).map((it: any) => ({
      description: it.description,
      hsnCode: it.hsnCode,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice: it.unitPrice,
      assessableValue: it.assessableValue || it.total || 0,
      cgstRate: it.cgstRate,
      cgstAmount: it.cgstAmount,
      sgstRate: it.sgstRate,
      sgstAmount: it.sgstAmount,
      igstRate: it.igstRate,
      igstAmount: it.igstAmount,
    })),
    taxableValue: invoice.subtotal ?? 0,
    cgstAmount: invoice.cgstTotal ?? 0,
    sgstAmount: invoice.sgstTotal ?? 0,
    igstAmount: invoice.igstTotal ?? 0,
    grandTotal: invoice.grandTotal ?? 0,
  });

  filing.status = result.status;
  filing.portalReferenceId = result.portalReferenceId;
  filing.lastRequestPayload = result.requestPayload;
  filing.lastResponsePayload = result.responsePayload;
  filing.submittedAt = new Date();
  if (!result.ok) {
    filing.rejectionReason = result.errorMessage;
  }
  await filing.save();

  // Mirror the e-invoice response onto the SalesInvoice record itself, too
  // — those fields (irn/ackNumber/ackDate/signedQrCode/einvoiceStatus)
  // already exist on the model for exactly this purpose (see
  // models/SalesInvoice.ts's "e-Invoice (INV-01) readiness" fields).
  if (result.ok && result.irn) {
    await SalesInvoice.updateOne(
      { _id: filing.invoiceId },
      {
        $set: {
          irn: result.irn,
          ackNumber: result.ackNumber,
          ackDate: result.ackDate ? new Date(result.ackDate) : undefined,
          signedQrCode: result.signedQrCode,
          einvoiceStatus: "FILED",
        },
      }
    );
  } else if (!result.ok) {
    await SalesInvoice.updateOne({ _id: filing.invoiceId }, { $set: { einvoiceStatus: "FAILED" } });
  }

  return filing;
}

export interface PushRangeInput {
  businessId: string;
  from: string; // ISO date
  to: string; // ISO date
  returnType: "GSTR1" | "GSTR3B" | "IFF";
  period: string;
  submittedBy?: string;
}

export interface PushRangeResultItem {
  invoiceId: string;
  invoiceNumber: string;
  status: IGstFiling["status"];
  errorMessage?: string;
}

/**
 * Bulk "Push Invoices to GST" for a date range — queues (or reuses) a
 * GstFiling per SalesInvoice issued in [from, to] for this business, then
 * immediately submits each one. Used by both the GST page's date-range
 * push action and the Reports page's "Push to GST" button so there's one
 * real implementation instead of two near-duplicates.
 */
export async function pushInvoicesForRange(input: PushRangeInput): Promise<PushRangeResultItem[]> {
  const fromDate = new Date(input.from);
  const toDate = new Date(input.to);
  toDate.setHours(23, 59, 59, 999);

  const invoices = await SalesInvoice.find({
    businessId: new Types.ObjectId(input.businessId),
    issueDate: { $gte: fromDate, $lte: toDate },
    isDeleted: { $ne: true },
    // B2B invoices here represent a vendor invoicing this business (vendor
    // is the invoicing/liable party -- see SalesInvoice.invoiceType's own
    // doc comment), not this business invoicing someone else. Only
    // STANDARD/B2C invoices are ones this business is actually responsible
    // for filing GST on.
    invoiceType: { $ne: "B2B" },
  })
    .select("_id invoiceNumber")
    .lean();

  const results: PushRangeResultItem[] = [];

  for (const inv of invoices) {
    try {
      const filing = await queueFiling({
        businessId: input.businessId,
        invoiceId: inv._id.toString(),
        returnType: input.returnType,
        period: input.period,
        submittedBy: input.submittedBy,
      });

      if (filing.status === "ACCEPTED" || filing.status === "SUBMITTED") {
        results.push({ invoiceId: inv._id.toString(), invoiceNumber: inv.invoiceNumber, status: filing.status });
        continue;
      }

      const submitted = await submitFiling(filing._id.toString());
      results.push({
        invoiceId: inv._id.toString(),
        invoiceNumber: inv.invoiceNumber,
        status: submitted.status,
        errorMessage: submitted.rejectionReason,
      });
    } catch (err) {
      results.push({
        invoiceId: inv._id.toString(),
        invoiceNumber: inv.invoiceNumber,
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return results;
}

/**
 * Everything not yet ACCEPTED — the "pendings" ANu is meant to help with,
 * per the user's explicit request. Ordered oldest-first so the longest-
 * outstanding filings surface first.
 */
export async function listPendingFilings(businessId: string) {
  return GstFiling.find({
    businessId: new Types.ObjectId(businessId),
    status: { $in: ["PENDING", "SUBMITTED", "FAILED", "REJECTED"] },
  })
    .sort({ createdAt: 1 })
    .lean();
}
