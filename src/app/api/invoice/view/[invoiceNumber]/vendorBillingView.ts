import Business from "@/models/Business";
import VendorProfile from "@/models/VendorProfile";
import { getStateCode } from "@/core/gst/stateCodes";
import { getDefaultTemplate } from "@/core/invoiceTemplates/service";
import type { IVendorBillingInvoice } from "@/models/VendorBillingInvoice";

// SAC (Services Accounting Code) for "Information technology (IT)
// software services" -- the closest standard GST classification for a
// SaaS module-access subscription fee. Same code applies to every line
// (all lines are the same kind of service: access to a software module),
// unlike a SalesInvoice's line items which can each be a different
// physical product with its own HSN.
const SUBSCRIPTION_SAC_CODE = "998314";
const GST_RATE = 18; // standard rate for SaaS/software services

/**
 * Builds the same InvoiceRenderData-shaped response the SalesInvoice path
 * returns, but for a VendorBillingInvoice -- a BUSINESS billing a VENDOR
 * for their subscription/module fees, i.e. the reverse direction from a
 * SalesInvoice (business selling to a walk-in/B2B customer). "company"
 * (the seller) is the Business; "customer" (the buyer) is the Vendor.
 * GST is computed here (VendorBillingInvoice.amount is stored as the
 * TAXABLE value, module rates summed with no tax baked in -- see
 * billing.service.ts) -- intrastate (CGST+SGST split) when the vendor's
 * state matches the business's state, interstate (IGST) otherwise, same
 * rule real GST invoicing uses. Returns null if the business or vendor
 * record can't be resolved -- caller falls through to its own 404.
 */
export async function buildVendorBillingInvoiceView(invoice: IVendorBillingInvoice) {
  const [business, vendor] = await Promise.all([
    Business.findById(invoice.businessId).lean<any>(),
    VendorProfile.findById(invoice.vendorId).lean<any>(),
  ]);
  if (!business || !vendor) return null;

  const savedTemplate = await getDefaultTemplate(String(invoice.businessId)).catch(() => null);

  // B2B when the vendor has a GST number on file, B2C otherwise -- GST is
  // still charged either way (GST registration status doesn't exempt a
  // buyer from tax, it only determines whether they can claim input
  // credit on it), so only `type` and whether the GSTIN row prints
  // change; the tax MATH below is identical for both. Matches the same
  // isB2B distinction the SalesInvoice path already makes at invoice-
  // creation time (api/crm/jobsheets/[id]/close/route.ts).
  const hasGstin = !!(vendor.gstNumber || "").trim();

  const taxable = invoice.amount || 0;
  const businessState = (business.state || "").trim().toLowerCase();
  const vendorState = (vendor.address?.state || "").trim().toLowerCase();
  // No state on file for either side -- can't determine intrastate vs
  // interstate, so default to interstate (IGST) rather than silently
  // guessing intrastate and under-charging CGST+SGST on what might
  // actually be a cross-state sale.
  const isIntrastate = !!businessState && businessState === vendorState;

  const cgst = isIntrastate ? Math.round(taxable * (GST_RATE / 2)) / 100 : 0;
  const sgst = isIntrastate ? Math.round(taxable * (GST_RATE / 2)) / 100 : 0;
  const igst = isIntrastate ? 0 : Math.round(taxable * GST_RATE) / 100;
  const grandTotal = taxable + cgst + sgst + igst;

  const items = (invoice.modules || []).map((m) => {
    const lineTaxable = m.rate || 0;
    const lineCgst = isIntrastate ? Math.round(lineTaxable * (GST_RATE / 2)) / 100 : 0;
    const lineSgst = isIntrastate ? Math.round(lineTaxable * (GST_RATE / 2)) / 100 : 0;
    const lineIgst = isIntrastate ? 0 : Math.round(lineTaxable * GST_RATE) / 100;
    return {
      name: `${m.key} — module access (${new Date(invoice.periodStart).toLocaleDateString("en-IN")} to ${new Date(invoice.periodEnd).toLocaleDateString("en-IN")})`,
      hsn: SUBSCRIPTION_SAC_CODE,
      qty: 1,
      rate: lineTaxable,
      discount: 0,
      taxable: lineTaxable,
      gstPercent: GST_RATE,
      cgst: lineCgst,
      sgst: lineSgst,
      igst: lineIgst,
      total: lineTaxable + lineCgst + lineSgst + lineIgst,
    };
  });

  return {
    success: true,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.paidAt || invoice.createdAt,
    orderDate: null,
    orderId: "",
    type: hasGstin ? "B2B" : "B2C",
    isGstInvoice: true,
    company: {
      name: business.name || business.legalName || "Business",
      tagline: savedTemplate?.branding?.tagline || "",
      address1: business.address || "",
      address2: "",
      city: business.city || "",
      state: business.state || "",
      gstin: business.compliance?.gstNumber || "",
      phone: business.phone || "",
      logoUrl: savedTemplate?.branding?.logoUrl || business.logo || "",
    },
    signatureUrl: business.documentSignatureUrl || "",
    bankDetails: business.bankAccountNumber
      ? {
          accountName: business.bankAccountName || "",
          accountNumber: business.bankAccountNumber || "",
          ifsc: business.bankIFSC || "",
          bankName: business.bankName || "",
        }
      : undefined,
    templateLayoutKey: savedTemplate?.layoutKey || undefined,
    templateConfig: savedTemplate
      ? {
          accentColor: savedTemplate.branding?.accentColor,
          footerNote: savedTemplate.text?.footerNote,
          declaration: savedTemplate.text?.declaration,
          termsAndConditions: savedTemplate.text?.termsAndConditions,
          showSignature: savedTemplate.text?.showSignature,
          signatureImageUrl: savedTemplate.text?.signatureImageUrl,
          signatoryLabel: savedTemplate.text?.signatoryLabel,
        }
      : undefined,
    customer: {
      name: vendor.companyName || vendor.contactPerson || "",
      phone: vendor.phone || "",
      email: vendor.email || "",
      address: vendor.address?.street || "",
      city: vendor.address?.city || "",
      state: vendor.address?.state || "",
      pincode: vendor.address?.pincode || "",
      gstin: vendor.gstNumber || "",
      stateCode: getStateCode(vendor.address?.state),
    },
    shipping: {
      name: vendor.companyName || vendor.contactPerson || "",
      phone: vendor.phone || "",
      address: vendor.address?.street || "",
      city: vendor.address?.city || "",
      state: vendor.address?.state || "",
      pincode: vendor.address?.pincode || "",
    },
    payment: {
      method: "ONLINE",
      status: invoice.status,
      transactionId: invoice.gatewayPaymentId || "",
    },
    items,
    summary: {
      subtotal: taxable,
      discount: 0,
      taxable,
      cgst,
      sgst,
      igst,
      grandTotal,
    },
    placeOfSupply: vendor.address?.state || "",
    stateCode: getStateCode(vendor.address?.state),
    supplyType: hasGstin ? "B2B" : "B2C",
    reverseCharge: "No",
  };
}
