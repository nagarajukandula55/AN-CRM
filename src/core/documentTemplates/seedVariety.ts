/**
 * Seeds 2 templates per document type (a default "Standard/GST" one + a
 * "Minimal" one) across every business, per explicit request: "documents
 * also put 2 or 3 templates in all the documents all should be according
 * to Indian norms." Shared between scripts/seedDocumentTemplateVariety.ts
 * (local/CLI use) and api/admin/seed-document-templates (in-app trigger,
 * for when there's no local .env.local / MONGODB_URI to run the script
 * against -- the running app already has its own DB connection).
 *
 * Only 5 of the 9 block types actually read any config at render time
 * (header/terms/signature/custom-text/spacer — see renderer.tsx), so
 * template-to-template distinctness comes from: which blocks are present,
 * their order, and that config text. Indian-GST terms/declaration text
 * below covers Sec. 31/34 CGST Act references, CGST+SGST vs IGST, and an
 * e-invoice IRN/QR placeholder (no dedicated IRN/QR block exists in the
 * palette yet — reserved as a custom-text placeholder; upgrade path is
 * adding a real block type to DocumentTemplate/renderer.tsx).
 *
 * INSERT-ONLY / idempotent: skips a (businessId, documentType, name)
 * combination that already exists, and never demotes an existing default
 * — only sets isDefault on the Standard variant when no default exists
 * yet for that type on that business.
 */

import Business from "@/models/Business";
import DocumentTemplate, { type DocumentTemplateType } from "@/models/DocumentTemplate";
import { makeBlock } from "./blockPalette";
import { createTemplate } from "./service";

const GST_TERMS = `1. Tax Invoice issued under Sec. 31 of the CGST Act, 2017.
2. GST charged as CGST + SGST on intra-state supply and as IGST on inter-state supply.
3. Tax payable under reverse charge: No.
4. Payment due within 15 days; interest @18% p.a. on overdue amounts.
5. Goods once sold are not taken back or exchanged.
6. Subject to local jurisdiction only. E.&O.E.`;

const GST_DECLARATION = `Certified that the particulars given above are true and correct and that the amount charged is the price actually charged, with no additional consideration flowing directly or indirectly from the buyer.`;

const EINVOICE_PLACEHOLDER = `IRN: __________________________   Ack No: ____________   Ack Date: __________
(Reserved for e-invoice IRN and signed QR code under Rule 48(4), where applicable.)`;

const BANK_DETAILS = `Bank: ____________   A/C No: ____________   IFSC: ____________   (for NEFT/RTGS/UPI)`;

interface TemplateSpec {
  name: string;
  accent: string;
  isDefault?: boolean;
  blocks: ReturnType<typeof makeBlock>[];
}

function b(type: Parameters<typeof makeBlock>[0], config: Record<string, unknown> = {}) {
  return { ...makeBlock(type), config };
}

function minimal(title: string): TemplateSpec {
  return {
    name: "Minimal",
    accent: "#111827",
    blocks: [
      b("header", { title }),
      b("company-details"),
      b("party-details"),
      b("items-table"),
      b("totals"),
      b("signature", { label: "Authorised Signatory" }),
    ],
  };
}

const SPECS: Record<DocumentTemplateType, TemplateSpec[]> = {
  INVOICE: [
    {
      name: "GST Tax Invoice (India)",
      accent: "#1e3a8a",
      isDefault: true,
      blocks: [
        b("header", { title: "TAX INVOICE" }),
        b("company-details"),
        b("party-details"),
        b("items-table"),
        b("totals"),
        b("custom-text", { text: GST_DECLARATION }),
        b("terms", { text: GST_TERMS }),
        b("custom-text", { text: EINVOICE_PLACEHOLDER }),
        b("signature", { label: "For (Company)\nAuthorised Signatory" }),
      ],
    },
    minimal("INVOICE"),
    {
      name: "Detailed Invoice",
      accent: "#0f766e",
      blocks: [
        b("header", { title: "TAX INVOICE" }),
        b("company-details"),
        b("party-details"),
        b("spacer", { height: 12 }),
        b("items-table"),
        b("totals"),
        b("terms", { text: GST_TERMS }),
        b("custom-text", { text: BANK_DETAILS }),
        b("custom-text", { text: GST_DECLARATION }),
        b("signature", { label: "For (Company)\nAuthorised Signatory" }),
      ],
    },
  ],
  PURCHASE_ORDER: [
    {
      name: "Standard PO",
      accent: "#1e3a8a",
      isDefault: true,
      blocks: [
        b("header", { title: "PURCHASE ORDER" }),
        b("company-details"),
        b("party-details"),
        b("items-table"),
        b("totals"),
        b("terms", { text: "Supply against this PO is subject to acceptance of these terms. Prices are inclusive/exclusive of GST as stated. Deliver to the address above by the agreed schedule." }),
        b("signature", { label: "For (Company)\nAuthorised Signatory" }),
      ],
    },
    minimal("PURCHASE ORDER"),
  ],
  QUOTATION: [
    {
      name: "Standard Quotation",
      accent: "#1e3a8a",
      isDefault: true,
      blocks: [
        b("header", { title: "QUOTATION" }),
        b("company-details"),
        b("party-details"),
        b("items-table"),
        b("totals"),
        b("terms", { text: "Quotation valid for 30 days from the date above. Prices exclusive of GST unless stated. Subject to stock availability." }),
        b("custom-text", { text: "This is a quotation, not a tax invoice." }),
        b("signature", { label: "Authorised Signatory" }),
      ],
    },
    minimal("QUOTATION"),
  ],
  DELIVERY_CHALLAN: [
    {
      name: "Standard Delivery Challan",
      accent: "#1e3a8a",
      isDefault: true,
      blocks: [
        b("header", { title: "DELIVERY CHALLAN" }),
        b("company-details"),
        b("party-details"),
        b("items-table"),
        b("custom-text", { text: "Not for sale — delivery challan issued under Rule 55 of the CGST Rules for movement of goods otherwise than by way of supply." }),
        b("terms", { text: "Transporter: ____________   Vehicle No: ____________" }),
        b("signature", { label: "Received in good condition" }),
      ],
    },
    minimal("DELIVERY CHALLAN"),
  ],
  CREDIT_NOTE: [
    {
      name: "Standard Credit Note",
      accent: "#7c2d12",
      isDefault: true,
      blocks: [
        b("header", { title: "CREDIT NOTE" }),
        b("company-details"),
        b("party-details"),
        b("items-table"),
        b("totals"),
        b("terms", { text: "Credit Note issued under Sec. 34 of the CGST Act, 2017. GST adjusted as CGST+SGST / IGST in line with the original invoice. Please quote the original invoice number and date in all correspondence." }),
        b("signature", { label: "For (Company)\nAuthorised Signatory" }),
      ],
    },
    minimal("CREDIT NOTE"),
  ],
  DEBIT_NOTE: [
    {
      name: "Standard Debit Note",
      accent: "#7c2d12",
      isDefault: true,
      blocks: [
        b("header", { title: "DEBIT NOTE" }),
        b("company-details"),
        b("party-details"),
        b("items-table"),
        b("totals"),
        b("terms", { text: "Debit Note issued under Sec. 34 of the CGST Act, 2017. Please quote the original invoice number and date in all correspondence." }),
        b("signature", { label: "For (Company)\nAuthorised Signatory" }),
      ],
    },
    minimal("DEBIT NOTE"),
  ],
  PROFORMA_INVOICE: [
    {
      name: "Standard Proforma Invoice",
      accent: "#1e3a8a",
      isDefault: true,
      blocks: [
        b("header", { title: "PROFORMA INVOICE" }),
        b("company-details"),
        b("party-details"),
        b("items-table"),
        b("totals"),
        b("custom-text", { text: "This is a Proforma Invoice, not a Tax Invoice — no input tax credit may be claimed against it." }),
        b("terms", { text: "Valid for 15 days from the date above. Advance payment required before dispatch/commencement." }),
        b("signature", { label: "Authorised Signatory" }),
      ],
    },
    minimal("PROFORMA INVOICE"),
  ],
  WORK_ORDER: [
    {
      name: "Standard Work Order",
      accent: "#0f766e",
      isDefault: true,
      blocks: [
        b("header", { title: "WORK ORDER" }),
        b("company-details"),
        b("party-details"),
        b("items-table"),
        b("totals"),
        b("terms", { text: "Scope of work covers labour and listed parts only. Additional issues found during service will be quoted separately for approval." }),
        b("signature", { label: "Customer Approval" }),
      ],
    },
    minimal("WORK ORDER"),
  ],
  ESTIMATE: [
    {
      name: "Standard Estimate",
      accent: "#0f766e",
      isDefault: true,
      blocks: [
        b("header", { title: "ESTIMATE" }),
        b("company-details"),
        b("party-details"),
        b("items-table"),
        b("totals"),
        b("custom-text", { text: "This is an estimate, not a final invoice. Charges may vary after diagnosis/approval." }),
        b("signature", { label: "Authorised Signatory" }),
      ],
    },
    minimal("ESTIMATE"),
  ],
  SALES_ORDER: [
    {
      name: "Standard Sales Order",
      accent: "#1e3a8a",
      isDefault: true,
      blocks: [
        b("header", { title: "SALES ORDER" }),
        b("company-details"),
        b("party-details"),
        b("items-table"),
        b("totals"),
        b("terms", { text: "Order confirmed as above. Expected delivery lead time will be communicated separately." }),
        b("signature", { label: "Authorised Signatory" }),
      ],
    },
    minimal("SALES ORDER"),
  ],
  STOCK_TRANSFER: [
    {
      name: "Standard Stock Transfer Note",
      accent: "#374151",
      isDefault: true,
      blocks: [
        b("header", { title: "STOCK TRANSFER NOTE" }),
        b("company-details"),
        b("party-details"),
        b("items-table"),
        b("custom-text", { text: "Internal stock movement (branch/warehouse transfer) — not a supply." }),
        b("terms", { text: "Transporter: ____________   Vehicle No: ____________" }),
        b("signature", { label: "Received By" }),
      ],
    },
    minimal("STOCK TRANSFER NOTE"),
  ],
  STOCK_ADJUSTMENT: [
    {
      name: "Standard Stock Adjustment",
      accent: "#374151",
      isDefault: true,
      blocks: [
        b("header", { title: "STOCK ADJUSTMENT" }),
        b("company-details"),
        b("party-details"),
        b("items-table"),
        b("custom-text", { text: "Internal inventory correction. Reason: ____________" }),
        b("signature", { label: "Approved By" }),
      ],
    },
    minimal("STOCK ADJUSTMENT"),
  ],
  PRODUCTION_ORDER: [
    {
      name: "Standard Production Order",
      accent: "#374151",
      isDefault: true,
      blocks: [
        b("header", { title: "PRODUCTION ORDER" }),
        b("company-details"),
        b("party-details"),
        b("items-table"),
        b("terms", { text: "Produce as per approved Bill of Materials and batch specifications." }),
        b("signature", { label: "Production In-charge" }),
      ],
    },
    minimal("PRODUCTION ORDER"),
  ],
  GRN: [
    {
      name: "Standard GRN",
      accent: "#374151",
      isDefault: true,
      blocks: [
        b("header", { title: "GOODS RECEIPT NOTE" }),
        b("company-details"),
        b("party-details"),
        b("items-table"),
        b("totals"),
        b("custom-text", { text: "Goods received and verified against the referenced Purchase Order." }),
        b("signature", { label: "Received & Inspected By" }),
      ],
    },
    minimal("GOODS RECEIPT NOTE"),
  ],
  SERVICE_RECORD: [
    {
      name: "Standard Service Record",
      accent: "#0f766e",
      isDefault: true,
      blocks: [
        b("header", { title: "SERVICE RECORD" }),
        b("company-details"),
        b("party-details"),
        b("items-table"),
        b("totals"),
        b("terms", { text: "Repair completed and handed over to the customer as described above. Warranty, if any, applies only to the parts/labour listed on this record." }),
        b("signature", { label: "Service Centre Signatory" }),
      ],
    },
    minimal("SERVICE RECORD"),
  ],
};

export async function seedDocumentTemplateVariety() {
  const businesses = await Business.find({}).select("_id name").lean();
  const results: { businessId: string; businessName: string; created: string[] }[] = [];

  for (const biz of businesses as any[]) {
    const created: string[] = [];
    for (const [documentType, specs] of Object.entries(SPECS) as [DocumentTemplateType, TemplateSpec[]][]) {
      for (const spec of specs) {
        const existing = await DocumentTemplate.findOne({ businessId: biz._id, documentType, name: spec.name });
        if (existing) continue;

        const hasDefault = await DocumentTemplate.findOne({ businessId: biz._id, documentType, isDefault: true });

        await createTemplate({
          businessId: String(biz._id),
          documentType,
          name: spec.name,
          blocks: spec.blocks,
          accentColor: spec.accent,
          isDefault: !!spec.isDefault && !hasDefault,
        });
        created.push(`${documentType}: ${spec.name}`);
      }
    }
    if (created.length > 0) results.push({ businessId: String(biz._id), businessName: biz.name, created });
  }

  return results;
}
