import type { DocumentRenderData } from "./renderData";

const fmtDate = (d?: string | Date) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

/** Business.logo unless the issuing service center (Warehouse) has its own
 * logoUrl set, in which case that takes precedence — the "based on SC
 * selection" override. */
export function resolveCompanyLogo(business: any, warehouse: any): string | undefined {
  return warehouse?.logoUrl || business?.logo || undefined;
}

/** When the document was issued from a specific service center (Warehouse),
 * that service center's own name/address/phone print on the "From" block
 * instead of the parent business's HQ details -- a customer walking into
 * one of several service centers a business runs needs to see which one
 * actually issued the document, not just the business's registered
 * address. GSTIN stays the business's (that's the actual GST
 * registration; a service center doesn't have its own), and logoUrl
 * already had this same warehouse-override behavior (see
 * resolveCompanyLogo above) -- this just extends it to the rest of the
 * "From" block instead of leaving it as the one field on its own. */
/** Per-document-type Terms & Conditions (Business.workorderTerms/
 * serviceOrderTerms/estimateTerms/invoiceTerms), falling back to the
 * single legacy Business.termsAndConditions when the specific one for
 * this document type is blank -- so a business that only ever set the
 * one field keeps seeing it everywhere, same as before these existed. */
function termsForDocType(business: any, documentType?: string): string | undefined {
  const perType: Record<string, string | undefined> = {
    WORK_ORDER: business?.workorderTerms,
    SERVICE_RECORD: business?.serviceOrderTerms,
    ESTIMATE: business?.estimateTerms,
    INVOICE: business?.invoiceTerms,
  };
  const specific = documentType ? perType[documentType] : undefined;
  return (specific?.trim() || business?.termsAndConditions) || undefined;
}

/**
 * `vendor` (a VendorProfile) takes precedence over both `business` and
 * `warehouse` for name/address/phone/GSTIN when given -- a multi-vendor
 * business shares ONE Business record (see VendorProfile's own comment on
 * why telegram* fields moved off Business for the same reason), so every
 * printed document -- workorder, estimate, service record, invoice --
 * used to show that one shared Business identity on every vendor's
 * documents instead of the issuing vendor's own. Falls back to
 * warehouse/business exactly as before when there's no vendor (or a field
 * the vendor hasn't filled in, e.g. VendorProfile has no logo of its own).
 */
export function businessToCompany(business: any, warehouse: any, documentType?: string, vendor?: any) {
  const name = vendor?.companyName || warehouse?.warehouseName || business?.name || business?.brandName || "";
  const vendorAddress = vendor?.address
    ? [vendor.address.street, vendor.address.city, vendor.address.state, vendor.address.pincode].filter(Boolean).join(", ")
    : undefined;
  const address = vendorAddress
    ? vendorAddress
    : warehouse
      ? [warehouse.address, warehouse.city, warehouse.state, warehouse.pincode].filter(Boolean).join(", ")
      : [business?.address, business?.city, business?.state].filter(Boolean).join(", ");
  const phone = vendor?.phone || warehouse?.mobile || undefined;
  return {
    name,
    address,
    phone,
    gstin: vendor?.gstNumber || business?.gstNumber || undefined,
    // documentLogoUrl is a separate upload from the vendor's sidebar
    // brand logo (vendor.logoUrl) -- falls back to that if unset, so a
    // vendor who enabled documentLogoEnabled before this field existed
    // keeps seeing the same logo on documents with no action needed.
    logoUrl: vendor?.documentLogoUrl || vendor?.logoUrl || resolveCompanyLogo(business, warehouse),
    termsAndConditions: termsForDocType(business, documentType),
    signatureUrl: vendor?.documentSignatureUrl || business?.documentSignatureUrl || undefined,
    upiId: vendor?.upiId || business?.upiId || undefined,
    logoEnabled: vendor?.documentLogoEnabled ?? !!business?.documentLogoEnabled,
    logoPosition: vendor?.documentLogoPosition || business?.documentLogoPosition || "LEFT",
    showDigitalDocumentNotice: vendor?.showDigitalDocumentNotice ?? !!business?.showDigitalDocumentNotice,
    showCcoNameOnPrint: vendor?.showCcoNameOnPrint ?? !!business?.showCcoNameOnPrint,
  };
}

/** Maps a CrmJobSheet document into the generic render shape for a
 * workorder or estimate print (same underlying data, different label +
 * footer disclaimer text). */
export function jobSheetToRenderData(
  jobSheet: any,
  docType: "WORK_ORDER" | "ESTIMATE",
  company: DocumentRenderData["company"]
): DocumentRenderData {
  const taxApplyEnabled = jobSheet.taxApplyEnabled !== false;
  const lineItems = (jobSheet.lineItems || []).filter((l: any) => l.description?.trim());
  const subtotal = lineItems.reduce((s: number, l: any) => s + (l.quantity || 0) * (l.unitPrice || 0), 0);
  const tax = taxApplyEnabled
    ? lineItems.reduce(
        (s: number, l: any) => s + (l.quantity || 0) * (l.unitPrice || 0) * ((l.taxRate || 0) / 100),
        0
      )
    : 0;
  // pendingBrandName is the free-text stand-in used when the real Brand is
  // still awaiting Super Admin approval (see CrmJobSheet.pendingBrandName) --
  // shown here so the printed document isn't just missing the brand entirely.
  const brandName = (typeof jobSheet.brandId === "object" ? jobSheet.brandId?.name : undefined) || jobSheet.pendingBrandName;
  const device = [jobSheet.product, brandName, jobSheet.deviceModel].filter(Boolean).join(" · ");
  const engineerName = jobSheet.assignedToName || (typeof jobSheet.assignedTo === "object" ? jobSheet.assignedTo?.name : undefined);

  // A Workorder is the document a technician/customer holds mid-repair,
  // before pricing is even settled -- no items/pricing at all, per
  // explicit direction ("no where part or billing details should be there
  // ... those details must come in service Record not workorder print").
  // ESTIMATE keeps them; that's the whole point of an estimate.
  const includePricing = docType === "ESTIMATE";

  return {
    docTypeLabel: docType === "ESTIMATE" ? "ESTIMATE" : "WORK ORDER",
    docNumber: jobSheet.jobSheetNumber,
    date: fmtDate(jobSheet.createdAt),
    status: jobSheet.status?.replace(/_/g, " "),
    company: { ...company, signedByName: docType === "WORK_ORDER" && company.showCcoNameOnPrint ? jobSheet.ccoName : undefined },
    party: {
      name: jobSheet.customerName,
      address: [jobSheet.address, jobSheet.city, jobSheet.state, jobSheet.pincode].filter(Boolean).join(", "),
      phone: jobSheet.phone,
      email: jobSheet.email,
    },
    items: includePricing
      ? lineItems.map((l: any) => {
          // Each ref is either populated ({code, description}) or a bare
          // ObjectId (unpopulated) -- only render when actually populated.
          const codeOf = (ref: any) => (ref && typeof ref === "object" && ref.code ? `${ref.code} — ${ref.description || ""}`.trim() : undefined);
          const diagnosis = [
            codeOf(l.faultCodeId) && `Fault: ${codeOf(l.faultCodeId)}`,
            codeOf(l.symptomCodeId) && `Symptom: ${codeOf(l.symptomCodeId)}`,
            codeOf(l.solutionId) && `Solution: ${codeOf(l.solutionId)}`,
          ].filter(Boolean).join(" · ") || undefined;
          const effRate = taxApplyEnabled ? (l.taxRate || 0) : 0;
          return {
            description: l.description,
            hsnCode: l.hsnCode,
            qty: l.quantity || 0,
            unit: l.unit,
            unitPrice: l.unitPrice || 0,
            taxRate: effRate,
            amount: (l.quantity || 0) * (l.unitPrice || 0) * (1 + effRate / 100),
            diagnosis,
          };
        })
      : [],
    totals: includePricing ? { subtotal, tax, grandTotal: subtotal + tax } : { subtotal: 0, tax: 0, grandTotal: 0 },
    // Customer contact is already the party-details block above -- these
    // notes carry Issue -> (work performed once repair is underway) ->
    // who logged/is fixing it, in that reading order, per explicit
    // direction on section ordering. Device identity itself moved to its
    // own `device` field (see below) so it prints as a labelled row like
    // the reference Service Handover Report layout, not buried in a text
    // blob.
    notes: [
      jobSheet.title && `Issue Reported: ${jobSheet.title}`,
      jobSheet.issueDescription && `Issue: ${jobSheet.issueDescription}`,
      jobSheet.workPerformed && `Work performed: ${jobSheet.workPerformed}`,
      jobSheet.ccoName && `Logged By (CCO): ${jobSheet.ccoName}`,
      engineerName && `Engineer: ${engineerName}`,
    ]
      .filter(Boolean)
      .join("\n"),
    device: {
      brand: brandName,
      model: jobSheet.deviceModel,
      imeiOrSerial: jobSheet.imeiOrSerialNumber,
    },
    footerText:
      docType === "ESTIMATE"
        ? "This is an estimate, not a final invoice. Prices are subject to change based on actual repair findings."
        : "This is a service work order and not a tax invoice.",
  };
}

/** Maps a CLOSED CrmJobSheet + its vendor's service-center info into the
 * generic render shape for the post-repair Service Record. Same line-item
 * shape as jobSheetToRenderData, but totals reflect what was actually PAID
 * (serviceCharge + parts, not an estimate), and notes carry the technical
 * consultant + service-center hours/hotline this document has always shown
 * (see the page it replaces, print/jobsheets/[id]/service-record).
 *
 * `invoice` (the real, persisted SalesInvoice created at close time) is
 * used as the source of truth for items/totals when present -- reported
 * live that the Service Record and the actual Invoice showed different
 * totals for the same workorder, because this used to always recompute
 * its own numbers straight from jobSheet.lineItems, which can diverge
 * from what the invoice actually has (Non-GST forces every line's tax to
 * zero regardless of the line's own taxRate, discountAmount can apply,
 * B2B uses a different series/shape entirely). Falls back to the old
 * recompute-from-lineItems path only if no invoice was generated yet. */
export function serviceRecordToRenderData(
  jobSheet: any,
  company: DocumentRenderData["company"],
  extra: { technicalConsultant?: string; ccoName?: string; hours?: string; hotline?: string },
  invoice?: any
): DocumentRenderData {
  const brandName = (typeof jobSheet.brandId === "object" ? jobSheet.brandId?.name : undefined) || jobSheet.pendingBrandName;

  let items: DocumentRenderData["items"];
  let totals: DocumentRenderData["totals"];

  if (invoice) {
    items = (invoice.items || []).map((it: any) => ({
      description: it.description,
      hsnCode: it.hsnCode,
      qty: it.quantity || 0,
      unit: it.unit,
      unitPrice: it.unitPrice || 0,
      taxRate: it.taxRate || 0,
      amount: it.total ?? (it.quantity || 0) * (it.unitPrice || 0) * (1 + (it.taxRate || 0) / 100),
      cgstRate: it.cgstRate || 0,
      sgstRate: it.sgstRate || 0,
      igstRate: it.igstRate || 0,
    }));
    totals = {
      subtotal: invoice.subtotal || 0,
      tax: invoice.taxTotal || 0,
      grandTotal: invoice.grandTotal || 0,
      cgst: invoice.cgstTotal || 0,
      sgst: invoice.sgstTotal || 0,
      igst: invoice.igstTotal || 0,
    };
  } else {
    const taxApplyEnabled = jobSheet.taxApplyEnabled !== false;
    const lineItems = (jobSheet.lineItems || []).filter((l: any) => l.description?.trim());
    const materialTotal = lineItems.reduce((s: number, l: any) => s + (l.quantity || 0) * (l.unitPrice || 0), 0);
    const tax = taxApplyEnabled
      ? lineItems.reduce(
          (s: number, l: any) => s + (l.quantity || 0) * (l.unitPrice || 0) * ((l.taxRate || 0) / 100),
          0
        )
      : 0;
    const serviceCharge = jobSheet.serviceCharge || 0;
    items = [
      ...lineItems.map((l: any) => {
        const effRate = taxApplyEnabled ? (l.taxRate || 0) : 0;
        return {
          description: l.description,
          hsnCode: l.hsnCode,
          qty: l.quantity || 0,
          unit: l.unit,
          unitPrice: l.unitPrice || 0,
          taxRate: effRate,
          amount: (l.quantity || 0) * (l.unitPrice || 0) * (1 + effRate / 100),
        };
      }),
      ...(serviceCharge > 0
        ? [{ description: "Repair Labor Cost", qty: 1, unitPrice: serviceCharge, taxRate: 0, amount: serviceCharge }]
        : []),
    ];
    totals = { subtotal: materialTotal + serviceCharge, tax, grandTotal: materialTotal + tax + serviceCharge };
  }

  return {
    docTypeLabel: "SERVICE RECORD",
    docNumber: jobSheet.jobSheetNumber,
    date: fmtDate(jobSheet.handedOverAt || jobSheet.completedAt || jobSheet.createdAt),
    status: jobSheet.status?.replace(/_/g, " "),
    company,
    party: {
      name: jobSheet.customerName,
      address: [jobSheet.address, jobSheet.city, jobSheet.state, jobSheet.pincode].filter(Boolean).join(", "),
      phone: jobSheet.phone,
      email: jobSheet.email,
    },
    items,
    totals,
    notes: [
      jobSheet.title && `Issue Reported: ${jobSheet.title}`,
      extra.ccoName && `Logged By (CCO): ${extra.ccoName}`,
      extra.technicalConsultant && `Technical Consultant: ${extra.technicalConsultant}`,
    ]
      .filter(Boolean)
      .join("\n"),
    device: {
      brand: brandName,
      model: jobSheet.deviceModel,
      imeiOrSerial: jobSheet.imeiOrSerialNumber,
    },
    footerBand: {
      hours: extra.hours,
      hotline: extra.hotline,
    },
    footerText: "This is a service record, not a tax invoice.",
  };
}

/** Maps a PurchaseOrder (+ populated vendorId/warehouseId, + its
 * PurchaseOrderItem[] with materialId populated) into the generic render
 * shape. Party is the vendor (this business is buying FROM them). */
export function purchaseOrderToRenderData(
  po: any,
  items: any[],
  company: DocumentRenderData["company"]
): DocumentRenderData {
  const vendor = po.vendorId || {};
  const vendorAddress = vendor.address
    ? [vendor.address.street, vendor.address.city, vendor.address.state, vendor.address.pincode].filter(Boolean).join(", ")
    : undefined;

  return {
    docTypeLabel: "PURCHASE ORDER",
    docNumber: po.poNumber,
    date: fmtDate(po.orderDate || po.createdAt),
    status: po.status,
    company,
    party: {
      name: vendor.businessName || vendor.legalName || vendor.name || "",
      address: vendorAddress,
      phone: vendor.phone,
      email: vendor.email,
      gstin: vendor.gstNumber,
    },
    items: items.map((it: any) => ({
      description: it.materialId?.name || it.description || "",
      hsnCode: it.hsnCode,
      qty: it.quantity || 0,
      unit: it.unit,
      unitPrice: it.unitPrice || 0,
      taxRate: it.taxRate || 0,
      amount: it.totalAmount ?? (it.quantity || 0) * (it.unitPrice || 0) * (1 + (it.taxRate || 0) / 100),
    })),
    totals: {
      subtotal: po.subtotal || items.reduce((s: number, it: any) => s + (it.quantity || 0) * (it.unitPrice || 0), 0),
      tax: po.taxTotal || 0,
      grandTotal: po.grandTotal || po.totalAmount || 0,
    },
    notes: po.notes,
  };
}

/** Maps a StockTransfer document into the generic render shape. Not a
 * billing document -- no external party, so "party" is the destination
 * warehouse and totals are informational (line value at unit cost, no tax). */
export function stockTransferToRenderData(
  transfer: any,
  company: DocumentRenderData["company"]
): DocumentRenderData {
  const items = (transfer.items || []).map((it: any) => ({
    description: it.itemName,
    hsnCode: it.sku,
    qty: it.quantity || 0,
    unit: it.unit,
    unitPrice: it.unitCost || 0,
    taxRate: 0,
    amount: (it.quantity || 0) * (it.unitCost || 0),
  }));
  const subtotal = items.reduce((s: number, it: any) => s + it.amount, 0);

  return {
    docTypeLabel: "STOCK TRANSFER",
    docNumber: transfer.transferNumber,
    date: fmtDate(transfer.createdAt),
    status: transfer.status,
    company,
    party: {
      name: `To: ${transfer.toWarehouse || "—"}`,
      address: transfer.fromWarehouse ? `From: ${transfer.fromWarehouse}` : undefined,
    },
    items,
    totals: { subtotal, tax: 0, grandTotal: subtotal },
    notes: transfer.notes,
    footerText: "Internal stock movement document — not a tax invoice.",
  };
}

/** Maps a StockAdjustment document into the generic render shape. Also not
 * a billing document -- a single-line correction record, no monetary
 * value inherent to a quantity adjustment. */
export function stockAdjustmentToRenderData(
  adjustment: any,
  itemLabel: string,
  company: DocumentRenderData["company"]
): DocumentRenderData {
  return {
    docTypeLabel: "STOCK ADJUSTMENT",
    docNumber: adjustment.adjustmentNumber || adjustment._id?.toString().slice(-8).toUpperCase(),
    date: fmtDate(adjustment.createdAt),
    status: adjustment.adjustmentType,
    company,
    party: { name: itemLabel || "—" },
    items: [
      {
        description: `${adjustment.adjustmentType} adjustment${adjustment.reason ? ` — ${adjustment.reason}` : ""}`,
        qty: adjustment.quantityAdjusted || 0,
        unitPrice: 0,
        taxRate: 0,
        amount: 0,
      },
    ],
    totals: { subtotal: 0, tax: 0, grandTotal: 0 },
    notes: [
      adjustment.notes,
      `Previous quantity: ${adjustment.previousQuantity ?? "—"}, new quantity: ${adjustment.newQuantity ?? "—"}`,
    ]
      .filter(Boolean)
      .join("\n"),
    footerText: "Internal inventory correction record — not a tax invoice.",
  };
}

/** Maps a ProductionOrder document into the generic render shape. Internal
 * manufacturing record -- "party" is the order itself (no external
 * counterparty), no monetary totals. */
export function productionOrderToRenderData(
  order: any,
  company: DocumentRenderData["company"]
): DocumentRenderData {
  return {
    docTypeLabel: "PRODUCTION ORDER",
    docNumber: order.orderNumber,
    date: fmtDate(order.plannedStartDate || order.createdAt),
    status: order.status,
    company,
    party: { name: "Internal Production Order" },
    items: [
      {
        description: order.productName,
        hsnCode: order.productSku,
        qty: order.plannedQuantity || 0,
        unit: order.unit,
        unitPrice: 0,
        taxRate: 0,
        amount: 0,
      },
    ],
    totals: { subtotal: 0, tax: 0, grandTotal: 0 },
    notes: [order.notes, `Produced: ${order.producedQuantity || 0} / ${order.plannedQuantity || 0} ${order.unit || ""}`]
      .filter(Boolean)
      .join("\n"),
    footerText: "Internal manufacturing document — not a tax invoice.",
  };
}

/** Maps the "Orders" admin page's SalesOrder record (the lightweight inline
 * schema in api/sales/orders/route.ts -- NOT the big ecommerce Order model,
 * which is a separate storefront-checkout concept with no print need yet)
 * into the generic render shape. Party is the customer (free-text name on
 * this schema, no structured address). */
export function salesOrderToRenderData(
  order: any,
  company: DocumentRenderData["company"]
): DocumentRenderData {
  const subtotal = (order.items || []).reduce(
    (s: number, it: any) => s + (it.total ?? (it.quantity || 0) * (it.unitPrice || 0)),
    0
  );

  return {
    docTypeLabel: "SALES ORDER",
    docNumber: order.orderNumber,
    date: fmtDate(order.createdAt),
    status: order.status,
    company,
    party: {
      name: order.customer || "",
      address: order.shippingAddress,
      email: order.customerEmail,
    },
    items: (order.items || []).map((it: any) => ({
      description: it.name,
      hsnCode: it.sku,
      qty: it.quantity || 0,
      unitPrice: it.unitPrice || 0,
      taxRate: 0,
      amount: it.total ?? (it.quantity || 0) * (it.unitPrice || 0),
    })),
    totals: {
      subtotal,
      tax: 0,
      grandTotal: order.totalAmount || subtotal,
    },
    notes: order.notes,
  };
}

/** Maps a SalesInvoice document into the generic render shape. */
export function salesInvoiceToRenderData(
  invoice: any,
  company: DocumentRenderData["company"]
): DocumentRenderData {
  return {
    docTypeLabel: "TAX INVOICE",
    docNumber: invoice.invoiceNumber,
    workOrderNumber: invoice.linkedJobSheetNumber || undefined,
    date: fmtDate(invoice.issueDate || invoice.createdAt),
    status: invoice.status,
    paymentMethod: invoice.paymentMethod,
    company,
    party: {
      name: invoice.customer?.name || "",
      address: invoice.customer?.address,
      phone: invoice.customer?.phone,
      email: invoice.customer?.email,
      gstin: invoice.customer?.gstin,
    },
    items: (invoice.items || []).map((item: any) => ({
      description: item.description,
      hsnCode: item.hsnCode,
      qty: item.quantity || 0,
      unit: item.unit,
      unitPrice: item.unitPrice || 0,
      taxRate: item.taxRate || 0,
      amount: item.total ?? (item.quantity || 0) * (item.unitPrice || 0) + (item.taxAmount || 0),
      cgstRate: item.cgstRate || 0,
      sgstRate: item.sgstRate || 0,
      igstRate: item.igstRate || 0,
    })),
    totals: {
      subtotal: invoice.subtotal || 0,
      tax: invoice.taxTotal || 0,
      discount: invoice.discountAmount || 0,
      grandTotal: invoice.grandTotal || 0,
      cgst: invoice.cgstTotal || 0,
      sgst: invoice.sgstTotal || 0,
      igst: invoice.igstTotal || 0,
    },
    notes: invoice.notes,
  };
}

const SALES_DOCUMENT_LABELS: Record<string, string> = {
  QUOTATION: "QUOTATION",
  DELIVERY_CHALLAN: "DELIVERY CHALLAN",
  CREDIT_NOTE: "CREDIT NOTE",
  DEBIT_NOTE: "DEBIT NOTE",
  PROFORMA_INVOICE: "PROFORMA INVOICE",
};

/** Maps a SalesDocument (Quotation/Delivery Challan/Credit Note/Debit
 * Note/Proforma Invoice — see models/SalesDocument.ts for why these 5
 * share one model) into the generic render shape. Its schema already
 * matches DocumentRenderData closely by design, so this is mostly a
 * straight pass-through plus computing each item's line amount. */
export function salesDocumentToRenderData(
  doc: any,
  company: DocumentRenderData["company"]
): DocumentRenderData {
  return {
    docTypeLabel: SALES_DOCUMENT_LABELS[doc.docType] || doc.docType,
    docNumber: doc.docNumber,
    date: fmtDate(doc.createdAt),
    status: doc.status,
    company,
    party: doc.party,
    items: (doc.items || []).map((it: any) => ({
      description: it.description,
      hsnCode: it.hsnCode,
      qty: it.quantity || 0,
      unit: it.unit,
      unitPrice: it.unitPrice || 0,
      taxRate: it.taxRate || 0,
      amount: (it.quantity || 0) * (it.unitPrice || 0) * (1 + (it.taxRate || 0) / 100),
    })),
    totals: {
      subtotal: doc.subtotal || 0,
      tax: doc.taxTotal || 0,
      discount: doc.discountAmount || 0,
      grandTotal: doc.grandTotal || 0,
    },
    notes: doc.notes,
  };
}

/** Maps a GoodsReceipt (+ populated vendorId/warehouseId/purchaseOrderId,
 * + its GoodsReceiptItem[] with materialId populated) into the generic
 * render shape. Party is the vendor goods were received from. */
export function goodsReceiptToRenderData(
  receipt: any,
  company: DocumentRenderData["company"]
): DocumentRenderData {
  const vendor = receipt.vendorId || {};
  const vendorAddress = vendor.address
    ? [vendor.address.street, vendor.address.city, vendor.address.state, vendor.address.pincode].filter(Boolean).join(", ")
    : undefined;

  return {
    docTypeLabel: "GOODS RECEIPT NOTE",
    docNumber: receipt.grnNumber,
    date: fmtDate(receipt.receiptDate || receipt.createdAt),
    status: receipt.status,
    company,
    party: {
      name: vendor.businessName || vendor.legalName || vendor.name || "",
      address: vendorAddress,
      phone: vendor.phone,
      email: vendor.email,
      gstin: vendor.gstNumber,
    },
    items: (receipt.items || []).map((it: any) => ({
      description: it.materialId?.name || it.materialName || "",
      hsnCode: it.materialCode,
      qty: it.acceptedQuantity || 0,
      unit: it.unit,
      unitPrice: it.unitRate || 0,
      taxRate: 0,
      amount: it.lineTotal ?? (it.acceptedQuantity || 0) * (it.unitRate || 0),
    })),
    totals: {
      subtotal: receipt.totalValue || 0,
      tax: 0,
      grandTotal: receipt.totalValue || 0,
    },
    notes: [
      receipt.remarks,
      receipt.purchaseOrderId?.poNumber ? `Against PO: ${receipt.purchaseOrderId.poNumber}` : undefined,
      receipt.totalRejectedQty ? `Rejected quantity: ${receipt.totalRejectedQty}` : undefined,
    ]
      .filter(Boolean)
      .join("\n"),
    footerText: "Goods Receipt Note — confirms quantities received and accepted into inventory.",
  };
}
