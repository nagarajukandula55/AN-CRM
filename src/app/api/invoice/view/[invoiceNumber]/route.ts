import { NextResponse } from "next/server";
import mongoose from "mongoose";
import SalesInvoice from "@/models/SalesInvoice";
import Order from "@/models/Order";
import Business from "@/models/Business";
import { connectDB } from "@/lib/mongodb";
import { getDefaultTemplate } from "@/core/invoiceTemplates/service";
import { getStateCode } from "@/core/gst/stateCodes";

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

    // sourceOrderId isn't always a real Order _id -- CRM-generated invoices
    // (see api/crm/jobsheets/[id]/close/route.ts) set it to a synthetic
    // string like "CRM_JOBSHEET:<id>" so the invoice can still reference
    // where it came from. Passing that straight into a Mongoose _id query
    // threw a CastError and 500'd this entire endpoint -- meaning every
    // CRM-originated invoice/estimate failed to render at all. Only look up
    // a real Order when sourceOrderId is actually a valid ObjectId.
    const order = mongoose.Types.ObjectId.isValid(invoice.sourceOrderId || "")
      ? await Order.findOne({ _id: invoice.sourceOrderId })
      : null;

    // Was hardcoded to "Native" + env vars (COMPANY_ADDRESS1 etc.) here —
    // meaning every business on this multi-tenant platform would show the
    // SAME company name/GSTIN/address on every invoice, regardless of
    // whose invoice it actually was. Fixed to read the real Business
    // record via invoice.businessId, falling back to the old env-var
    // values only if a business record can't be found (so this doesn't
    // hard-break for any pre-existing invoice whose businessId is stale).
    const business = invoice.businessId
      ? await Business.findById(invoice.businessId).lean()
      : null;

    // Also pull this business's saved invoice-template branding (logo,
    // tagline) if one exists — see core/invoiceTemplates/service.ts. Falls
    // back to no logo / no override tagline if nothing's been configured.
    const savedTemplate = invoice.businessId
      ? await getDefaultTemplate(String(invoice.businessId)).catch(() => null)
      : null;

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
