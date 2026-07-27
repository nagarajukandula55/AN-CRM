/**
 * Migrate old Invoice.ts documents onto the canonical SalesInvoice model.
 *
 * Invoice.ts (ecommerce/order-based, flat GST fields) was merged into
 * SalesInvoice.ts (B2B/GST-rich, e-invoice-ready — see SalesInvoice.ts's
 * top comment). This script is insert-only: it never modifies or deletes
 * the original Invoice collection, so it's safe to re-run and safe to keep
 * that collection around as a historical archive afterward.
 *
 * DRY RUN BY DEFAULT — prints what it would do without writing anything.
 *   npx tsx --env-file=.env.local scripts/migrateInvoiceToSalesInvoice.ts
 * Pass --execute to actually write:
 *   npx tsx --env-file=.env.local scripts/migrateInvoiceToSalesInvoice.ts --execute
 *
 * Before running with --execute against a database with real data, take a
 * mongodump backup first.
 */

import { connectDB } from "../src/core/db/mongodb";
import Invoice from "../src/models/Invoice";
import SalesInvoice from "../src/models/SalesInvoice";
import mongoose from "mongoose";

const EXECUTE = process.argv.includes("--execute");

function mapStatus(oldStatus?: string, paymentStatus?: string): string {
  // paymentStatus (PENDING/PAID/FAILED/PARTIAL) carries the real payment
  // outcome; oldStatus (GENERATED/LOCKED/CANCELLED) was mostly a document
  // lifecycle flag. SalesInvoice's single `status` field now covers both.
  if (oldStatus === "CANCELLED") return "CANCELLED";
  if (paymentStatus === "PAID") return "PAID";
  if (paymentStatus === "FAILED") return "FAILED";
  if (paymentStatus === "PARTIAL") return "PARTIAL";
  return "SENT";
}

function mapItem(item: any) {
  const gstPercent = Number(item.gstPercent || 0);
  const cgst = Number(item.cgst || 0);
  const sgst = Number(item.sgst || 0);
  const igst = Number(item.igst || 0);
  const taxableValue = Number(item.taxableValue || 0);
  return {
    description: item.name || "",
    hsnCode: item.hsn || "",
    quantity: Number(item.qty || 1),
    unit: "pcs",
    unitPrice: Number(item.price || 0),
    taxRate: gstPercent,
    taxAmount: cgst + sgst + igst,
    cgstRate: cgst ? gstPercent / 2 : 0,
    cgstAmount: cgst,
    sgstRate: sgst ? gstPercent / 2 : 0,
    sgstAmount: sgst,
    igstRate: igst ? gstPercent : 0,
    igstAmount: igst,
    assessableValue: taxableValue,
    total: Number(item.total || taxableValue + cgst + sgst + igst),
  };
}

async function main() {
  await connectDB();

  const oldInvoices = await Invoice.find({}).lean();
  console.log(`Found ${oldInvoices.length} Invoice document(s) to consider.`);

  let migrated = 0;
  let skippedExisting = 0;
  const samples: any[] = [];

  for (const inv of oldInvoices as any[]) {
    const existing = await SalesInvoice.findOne({ invoiceNumber: inv.invoiceNumber }).lean();
    if (existing) {
      skippedExisting++;
      continue;
    }

    const mapped = {
      businessId: mongoose.isValidObjectId(inv.businessId) ? inv.businessId : undefined,
      sourceOrderId: inv.orderId ? String(inv.orderId) : undefined,
      invoiceNumber: inv.invoiceNumber,
      invoiceType: inv.invoiceType === "TAX" ? "STANDARD" : inv.invoiceType || "STANDARD",
      customer: {
        name: inv.customer?.name || "",
        email: inv.customer?.email,
        phone: inv.customer?.phone,
        address: inv.customer?.address,
        city: inv.customer?.city,
        gstin: inv.customer?.gstNumber,
        state: inv.customer?.state,
        pincode: inv.customer?.pincode,
      },
      items: (inv.items || []).map(mapItem),
      subtotal: Number(inv.subtotal || 0),
      discountAmount: Number(inv.discount || 0),
      cgstTotal: Number(inv.cgst || 0),
      sgstTotal: Number(inv.sgst || 0),
      igstTotal: Number(inv.igst || 0),
      taxTotal: Number(inv.cgst || 0) + Number(inv.sgst || 0) + Number(inv.igst || 0),
      grandTotal: Number(inv.grandTotal || 0),
      status: mapStatus(inv.status, inv.paymentStatus),
      isLocked: inv.locked === true || inv.status === "LOCKED",
      pdfUrl: inv.pdfUrl,
      irn: inv.irn,
      ackNumber: inv.ackNo,
      ackDate: inv.ackDate,
      createdAt: inv.createdAt,
      updatedAt: inv.updatedAt,
    };

    if (samples.length < 3) samples.push({ from: inv.invoiceNumber, to: mapped });

    if (EXECUTE) {
      await SalesInvoice.create(mapped);
    }
    migrated++;
  }

  console.log(`\n${EXECUTE ? "Migrated" : "Would migrate"}: ${migrated}`);
  console.log(`Skipped (already exists in SalesInvoice by invoiceNumber): ${skippedExisting}`);
  if (samples.length) {
    console.log("\nSample mappings:");
    console.log(JSON.stringify(samples, null, 2));
  }
  if (!EXECUTE) {
    console.log("\nDRY RUN ONLY — no documents were written. Re-run with --execute to apply.");
    console.log("Take a mongodump backup of the target database before running with --execute.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
