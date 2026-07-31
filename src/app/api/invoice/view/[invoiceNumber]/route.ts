import { NextResponse } from "next/server";
import SalesInvoice from "@/models/SalesInvoice";
import { getBusinessBySourceId } from "@/lib/centralApiRead";
import { connectDB } from "@/lib/mongodb";
import { getDefaultTemplate } from "@/core/invoiceTemplates/service";
import { getStateCode } from "@/core/gst/stateCodes";
import { generateUpiQrDataUrl } from "@/core/payments/upiQr";

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

    // Also pull this business's saved invoice-template branding (logo,
    // tagline) if one exists — see core/invoiceTemplates/service.ts. Falls
    // back to no logo / no override tagline if nothing's been configured.
    const savedTemplate = invoice.businessId
      ? await getDefaultTemplate(String(invoice.businessId)).catch(() => null)
      : null;

    // UPI payment QR -- only generated when this business has a VPA
    // configured (Settings > Operations). See core/payments/upiQr.ts.
    const upiId = (business as any)?.upiId?.trim();
    const paymentQrUrl = upiId
      ? await generateUpiQrDataUrl({
          vpa: upiId,
          payeeName: (business as any)?.legalName || (business as any)?.name || "Business",
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
          (business as any)?.name ||
          (business as any)?.legalName ||
          process.env.COMPANY_NAME ||
          "Business",

        tagline:
          savedTemplate?.branding?.tagline ||
          process.env.COMPANY_TAGLINE ||
          "",

        address1:
          (business as any)?.address ||
          process.env.COMPANY_ADDRESS1 ||
          "",

        address2:
          process.env.COMPANY_ADDRESS2 || "",

        city:
          (business as any)?.city ||
          process.env.COMPANY_CITY ||
          "",

        state:
          (business as any)?.state ||
          process.env.COMPANY_STATE ||
          "",

        gstin:
          (business as any)?.compliance?.gstNumber ||
          process.env.COMPANY_GSTIN ||
          "",

        phone:
          (business as any)?.phone ||
          process.env.COMPANY_PHONE ||
          "",

        logoUrl:
          savedTemplate?.branding?.logoUrl ||
          (business as any)?.logo ||
          "",
      },

      // Signature image -- Owner/Manager-set at Vendor Settings >
      // Business Settings > Signature (Business.documentSignatureUrl).
      // Blank means no signature image prints; the page shows a
      // "digital document" notice instead of a physical signature.
      signatureUrl: (business as any)?.documentSignatureUrl || "",

      // Display-only bank transfer details -- same manual-reconciliation
      // "workaround" as the UPI QR above (see core/payments/upiQr.ts's
      // own comment), for a customer who'd rather bank-transfer than
      // scan a UPI QR. Only sent through when an account number is
      // actually set, so a business that hasn't configured this doesn't
      // print an empty "Bank Details" block.
      bankDetails: (business as any)?.bankAccountNumber
        ? {
            accountName: (business as any)?.bankAccountName || "",
            accountNumber: (business as any)?.bankAccountNumber || "",
            ifsc: (business as any)?.bankIFSC || "",
            bankName: (business as any)?.bankName || "",
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
        method:
          order?.payment?.method ||
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
