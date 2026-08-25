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
// Standard rate for SaaS/software services -- exported so
// api/vendor/billing/subscribe/route.ts can charge the SAME rate on top
// of the displayed (GST-exclusive) plan price, keeping "what the pricing
// page shows + GST" and "what this invoice backs out of the charge" as
// the same number by construction, not two independently-maintained 18s.
export const GST_RATE = 18;

/**
 * Builds the same InvoiceRenderData-shaped response the SalesInvoice path
 * returns, but for a VendorBillingInvoice -- a BUSINESS billing a VENDOR
 * for their subscription/module fees, i.e. the reverse direction from a
 * SalesInvoice (business selling to a walk-in/B2B customer). "company"
 * (the seller) is the Business; "customer" (the buyer) is the Vendor.
 * GST is computed here. invoice.amount is the GST-INCLUSIVE total --
 * it's the exact figure createRazorpayOrder() charges the vendor (see
 * paymentGateway.ts: `Math.round(invoice.amount * 100)` paise, nothing
 * added on top) -- so it MUST be treated as the final/grand total here
 * too, with taxable/tax backed out of it, not as a pre-tax base with GST
 * added on top (that produced a rendered grand total ~18% higher than
 * what the vendor was actually charged -- reported live, fixed here).
 * Intrastate (CGST+SGST split) when the vendor's state matches the
 * business's state, interstate (IGST) otherwise, same rule real GST
 * invoicing uses. Returns null if the business or vendor record can't be
 * resolved -- caller falls through to its own 404.
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

  // Back out the taxable value from the GST-INCLUSIVE grand total (what
  // was actually charged) instead of treating it as a pre-tax base --
  // see this function's own comment above. taxable = amount / 1.18,
  // rounded to paise; tax is whatever's left so cgst+sgst (or igst) plus
  // taxable always sums to EXACTLY invoice.amount, never off by rounding.
  const grandTotal = invoice.amount || 0;
  const taxable = Math.round((grandTotal / (1 + GST_RATE / 100)) * 100) / 100;
  const totalTax = Math.round((grandTotal - taxable) * 100) / 100;

  const businessState = (business.state || "").trim().toLowerCase();
  const vendorState = (vendor.address?.state || "").trim().toLowerCase();
  // No state on file for either side -- can't determine intrastate vs
  // interstate, so default to interstate (IGST) rather than silently
  // guessing intrastate and under-charging CGST+SGST on what might
  // actually be a cross-state sale.
  const isIntrastate = !!businessState && businessState === vendorState;

  const cgst = isIntrastate ? Math.round((totalTax / 2) * 100) / 100 : 0;
  const sgst = isIntrastate ? Math.round((totalTax / 2) * 100) / 100 : 0;
  const igst = isIntrastate ? 0 : totalTax;

  // ONE line for the whole plan/period, not one per internal module key --
  // invoice.modules[] exists purely as internal bookkeeping so
  // VendorSubscription.modules keeps a per-module rate for access-gating
  // (see api/vendor/billing/subscribe/route.ts's own comment); a vendor
  // reading their invoice doesn't need or want AN-CRM's internal module
  // list itemized as 13 near-identical "module access" lines, they want
  // to see what they paid for: their plan, for this period.
  const periodLabel = `${new Date(invoice.periodStart).toLocaleDateString("en-IN")} to ${new Date(invoice.periodEnd).toLocaleDateString("en-IN")}`;
  const items = [
    {
      name: `${invoice.planName || "AN-CRM"} plan — subscription (${periodLabel})`,
      hsn: SUBSCRIPTION_SAC_CODE,
      qty: 1,
      rate: taxable,
      discount: 0,
      taxable,
      gstPercent: GST_RATE,
      cgst,
      sgst,
      igst,
      total: grandTotal,
    },
  ];

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
