import { NextResponse } from "next/server";
import SalesInvoice from "@/models/SalesInvoice";
import VendorBillingInvoice from "@/models/VendorBillingInvoice";
import VendorProfile from "@/models/VendorProfile";
import { getBusinessBySourceId } from "@/lib/centralApiRead";
import { connectDB } from "@/lib/mongodb";
import { getDefaultTemplate } from "@/core/invoiceTemplates/service";
import { getStateCode } from "@/core/gst/stateCodes";
import { generateUpiQrDataUrl } from "@/core/payments/upiQr";
import { buildVendorBillingInvoiceView } from "./vendorBillingView";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  context: any
) {
  try {
    await connectDB();

    const { invoiceNumber } = await context.params;

    // This same route also backs the public share-link viewer at
    // /invoice/view/[token] (see api/sales/invoices/[id]/share/route.ts,
    // which mints a shareToken and points users at /invoice/view/<token>).
    // That token is a random hex string, not an invoiceNumber, so an
    // invoiceNumber-only lookup here always 404'd for every share link ever
    // generated -- the share feature was completely non-functional. Match
    // on either field.
    const invoice =
      await SalesInvoice.findOne({
        $or: [{ invoiceNumber }, { shareToken: invoiceNumber }],
      });

    if (
      invoice &&
      invoice.shareToken === invoiceNumber &&
      invoice.invoiceNumber !== invoiceNumber &&
      invoice.shareExpiry &&
      invoice.shareExpiry.getTime() < Date.now()
    ) {
      return NextResponse.json(
        { success: false, message: "This share link has expired" },
        { status: 410 }
      );
    }

    // Was `invoice.customer?.state` read here BEFORE the `if (!invoice)`
    // null-check below — if the invoiceNumber didn't match any document,
    // this would throw reading `.customer` off `null` instead of returning
    // the intended 404. Moved below the null-check, and the state-code
    // lookup along with it. The 28-entry STATE_CODES map that used to be
    // inlined here was extracted to core/gst/stateCodes.ts so the new
    // Cloudinary-generation path (api/invoice/generate/route.ts) can use
    // the same lookup instead of a second copy that would drift.
    if (!invoice) {
      // Fall back to a VendorBillingInvoice (a business billing a VENDOR
      // for their subscription/module fees -- "when vendor paid to us we
      // can issue the same type of invoice"). Same view page, same GST
      // tax-invoice layouts -- just a different source document and
      // buyer/seller direction (the Business is the seller here, the
      // Vendor is the customer), built in its own helper to keep this
      // already-long SalesInvoice path unchanged.
      const vendorInvoice = await VendorBillingInvoice.findOne({ invoiceNumber }).lean();
      if (vendorInvoice) {
        const view = await buildVendorBillingInvoiceView(vendorInvoice as any);
        if (view) return NextResponse.json(view);
      }
      return NextResponse.json(
        {
          success: false,
          message: "Invoice not found",
        },
        {
          status: 404,
        }
      );
    }

    const stateCode = getStateCode(invoice.customer?.state);

    // AN-CRM invoices are always CRM/POS/subscription-originated -- there's
    // no separate storefront "Order" record to enrich this view with, so
    // orderDate/orderId/payment-method-fallback below all just read as
    // absent instead of being looked up from a second collection.
    type LegacyOrderStub = { createdAt?: Date; orderId?: string; payment?: any; razorpayPaymentId?: string };
    const order = null as LegacyOrderStub | null;

    // Was hardcoded to "Native" + env vars (COMPANY_ADDRESS1 etc.) here —
    // meaning every business on this multi-tenant platform would show the
    // SAME company name/GSTIN/address on every invoice, regardless of
    // whose invoice it actually was. Fixed to read the real Business
    // record via invoice.businessId, falling back to the old env-var
    // values only if a business record can't be found (so this doesn't
    // hard-break for any pre-existing invoice whose businessId is stale).
    // Reads from central-api — see src/lib/centralApiRead.ts.
    const business = invoice.businessId
      ? await getBusinessBySourceId(String(invoice.businessId))
      : null;

    // Multi-vendor businesses share ONE Business record (see VendorProfile's
    // own comment on why telegram* fields moved off Business) -- printing
    // just the Business's own name/address/GSTIN on every invoice meant
    // every vendor under that business showed the SAME identity in the
    // top-left header, never their own shop's details. Prefer the
    // job-sheet's own vendor (invoice.vendorId, see close/route.ts) when
    // set, falling back to Business for anything the vendor hasn't filled
    // in (VendorProfile has no separate logo field, for instance).
    const vendor = (invoice as any).vendorId
      ? await VendorProfile.findById((invoice as any).vendorId)
          .select("companyName phone address gstNumber upiId bankAccountName bankAccountNumber bankIFSC bankName")
          .lean<any>()
      : null;

    // Also pull this business's saved invoice-template branding (logo,
    // tagline) if one exists — see core/invoiceTemplates/service.ts. Falls
    // back to no logo / no override tagline if nothing's been configured.
    const savedTemplate = invoice.businessId
      ? await getDefaultTemplate(String(invoice.businessId)).catch(() => null)
      : null;

    // UPI payment QR -- only generated when this business has a VPA
    // configured (Settings > Operations). See core/payments/upiQr.ts.
    // showPaymentQr/showBankDetails/showSignature default true (unset on
    // any invoice created before this per-invoice opt-out existed), so
    // existing invoices keep printing these exactly as before.
    // A vendor's OWN UPI/bank details override the shared platform
    // Business's -- every self-signed-up vendor points at the same
    // Business record (see VendorProfile's own comment on why telegram*
    // moved off Business, same reasoning applies here), so without this a
    // vendor's saved payment details could never show on their own
    // invoices, or worse, another vendor's saved details would show
    // instead. Same overlay pattern as document-templates/resolve/route.ts.
    const upiId = (vendor?.upiId?.trim() || (business as any)?.upiId?.trim());
    const paymentQrUrl = upiId && invoice.showPaymentQr !== false
      ? await generateUpiQrDataUrl({
          vpa: upiId,
          payeeName: vendor?.companyName || (business as any)?.legalName || (business as any)?.name || "Business",
          amount: invoice.grandTotal || 0,
          invoiceNumber: invoice.invoiceNumber,
        }).catch(() => undefined)
      : undefined;

    return NextResponse.json({
      success: true,

      invoiceNumber:
        invoice.invoiceNumber,

      invoiceDate:
        invoice.createdAt,

      // No fallback to invoice.createdAt here on purpose: leaving this null
      // when there's no linked Order (e.g. CRM-originated invoices) lets the
      // page omit the "Order Date" row entirely instead of rendering
      // `new Date("")` -> "Invalid Date" as if it were real data.
      orderDate:
        order?.createdAt || null,

      orderId:
        order?.orderId || "",

      type:
        invoice.invoiceType,

      // NON_GST_INVOICE ("BILL-...") documents carry zero tax -- see the
      // isB2B/applyTaxOnB2CBilling branch in
      // api/crm/jobsheets/[id]/close/route.ts. Lets the printable page
      // title itself "BILL" instead of "TAX INVOICE" for these, matching
      // what the number series and invoiceType already distinguish.
      isGstInvoice: (invoice.taxTotal || 0) > 0,

      company: {
        name:
          vendor?.companyName ||
          (business as any)?.name ||
          (business as any)?.legalName ||
          process.env.COMPANY_NAME ||
          "Business",

        tagline:
          savedTemplate?.branding?.tagline ||
          process.env.COMPANY_TAGLINE ||
          "",

        address1:
          vendor?.address?.street ||
          (business as any)?.address ||
          process.env.COMPANY_ADDRESS1 ||
          "",

        address2:
          process.env.COMPANY_ADDRESS2 || "",

        city:
          vendor?.address?.city ||
          (business as any)?.city ||
          process.env.COMPANY_CITY ||
          "",

        state:
          vendor?.address?.state ||
          (business as any)?.state ||
          process.env.COMPANY_STATE ||
          "",

        gstin:
          vendor?.gstNumber ||
          (business as any)?.compliance?.gstNumber ||
          process.env.COMPANY_GSTIN ||
          "",

        phone:
          vendor?.phone ||
          (business as any)?.phone ||
          process.env.COMPANY_PHONE ||
          "",

        // No per-vendor logo field on VendorProfile -- every vendor under a
        // shared Business still prints that Business's own logo/branding.
        logoUrl:
          savedTemplate?.branding?.logoUrl ||
          (business as any)?.logo ||
          "",
      },

      // Signature image -- Owner/Manager-set at Vendor Settings >
      // Business Settings > Signature (Business.documentSignatureUrl).
      // Blank means no signature image prints; the page shows a
      // "digital document" notice instead of a physical signature.
      signatureUrl: invoice.showSignature !== false ? (business as any)?.documentSignatureUrl || "" : "",

      // Display-only bank transfer details -- same manual-reconciliation
      // "workaround" as the UPI QR above (see core/payments/upiQr.ts's
      // own comment), for a customer who'd rather bank-transfer than
      // scan a UPI QR. Only sent through when an account number is
      // actually set, so a business that hasn't configured this doesn't
      // print an empty "Bank Details" block. Mutually exclusive with the
      // QR above -- never print both payment options on one invoice, per
      // explicit direction. QR wins when both are enabled (matches the
      // schema default of both flags true for every invoice that predates
      // this per-invoice choice, including every CRM-jobsheet invoice,
      // which never set these fields at all).
      bankDetails: !paymentQrUrl && (vendor?.bankAccountNumber || (business as any)?.bankAccountNumber) && invoice.showBankDetails !== false
        ? {
            accountName: vendor?.bankAccountName || (business as any)?.bankAccountName || "",
            accountNumber: vendor?.bankAccountNumber || (business as any)?.bankAccountNumber || "",
            ifsc: vendor?.bankIFSC || (business as any)?.bankIFSC || "",
            bankName: vendor?.bankName || (business as any)?.bankName || "",
          }
        : undefined,

      templateLayoutKey: savedTemplate?.layoutKey || undefined,
      templateConfig: savedTemplate || paymentQrUrl
        ? {
            accentColor: savedTemplate?.branding?.accentColor,
            footerNote: savedTemplate?.text?.footerNote,
            declaration: savedTemplate?.text?.declaration,
            termsAndConditions: savedTemplate?.text?.termsAndConditions,
            showSignature: savedTemplate?.text?.showSignature,
            signatureImageUrl: savedTemplate?.text?.signatureImageUrl,
            signatoryLabel: savedTemplate?.text?.signatoryLabel,
            paymentQrUrl,
          }
        : undefined,

      customer: {
        name:
          invoice.customer?.name,

        phone:
          invoice.customer?.phone,

        email:
          invoice.customer?.email,

        address:
          invoice.customer?.address,

        city:
          invoice.customer?.city,

        state:
          invoice.customer?.state,

        pincode:
          invoice.customer?.pincode,

        gstin:
          invoice.customer?.gstin,

        stateCode: stateCode,
      },

      shipping: {
        name:
          invoice.customer?.name,

        phone:
          invoice.customer?.phone,

        address:
          invoice.customer?.address,

        city:
          invoice.customer?.city,

        state:
          invoice.customer?.state,

        pincode:
          invoice.customer?.pincode,
      },

      payment: {
        // order is always null for a CRM-originated invoice (see the
        // LegacyOrderStub comment above), which meant this always fell
        // straight through to the hardcoded "ONLINE" fallback regardless
        // of how the customer actually paid (cash/UPI/card at handover --
        // see api/crm/jobsheets/[id]/handover/route.ts). invoice.paymentMethod
        // is the real, invoice-level field for that.
        method:
          order?.payment?.method ||
          (invoice as any).paymentMethod ||
          "ONLINE",

        status:
          invoice.status,

        transactionId:
          order?.payment?.razorpayPaymentId ||
          order?.payment?.paymentId ||
          order?.payment?.transactionId ||
          order?.razorpayPaymentId ||
          "",
      },

      items:
        invoice.items.map((item:any)=>({

          name: item.description,

          hsn: item.hsnCode,

          qty: item.quantity,

          rate: item.unitPrice,

          discount: 0,

          taxable:
            item.assessableValue || 0,

          gstPercent:
            item.taxRate || 0,

          cgst:
            item.cgstAmount || 0,

          sgst:
            item.sgstAmount || 0,

          igst:
            item.igstAmount || 0,

          total:
            item.total || 0,
        })),

      summary: {
        subtotal:
          invoice.subtotal || 0,

        discount:
          invoice.discountAmount || 0,

        taxable:
          (invoice.subtotal || 0) - (invoice.discountAmount || 0),

        cgst:
          invoice.cgstTotal || 0,

        sgst:
          invoice.sgstTotal || 0,

        igst:
          invoice.igstTotal || 0,

        grandTotal:
          invoice.grandTotal || 0,
      },

      placeOfSupply:
        invoice.customer?.state,

      stateCode,

      supplyType:
        invoice.invoiceType ===
        "B2B"
          ? "Business"
          : "Consumer",

      reverseCharge:
        "No",
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        message:
          err.message,
      },
      {
        status: 500,
      }
    );
  }
}
