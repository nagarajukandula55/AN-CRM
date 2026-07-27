export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Order from "@/models/Order";
import Business from "@/models/Business";
import { createInvoiceForOrder } from "@/lib/invoice/createInvoice";
import { renderInvoiceForBusiness } from "@/core/invoiceTemplates/service";
import { buildRenderDataFromInvoice } from "@/core/invoiceTemplates/fromInvoiceDoc";
import cloudinary from "@/lib/cloudinary";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

console.log("TEMPLATE VERSION: GST-V2");

/* =========================================
   POST - GENERATE INVOICE
========================================= */
export async function POST(req: Request) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("finance", "create"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    await connectDB();

    const body = await req.json().catch(() => null);
    const orderId = body?.orderId;

    if (!orderId) {
      return NextResponse.json(
        { success: false, message: "orderId required" },
        { status: 400 }
      );
    }

    const order = await Order.findOne({ orderId });

    if (!order) {
      return NextResponse.json(
        { success: false, message: "Order not found" },
        { status: 404 }
      );
    }

    /* =========================================
       CREATE / GET INVOICE DB RECORD
    ========================================= */
    const invoiceDoc = await createInvoiceForOrder(orderId);

    const invoiceNumber = invoiceDoc.invoiceNumber;

    /* =========================================
       BUILD HTML — same template registry the live invoice page and the
       admin picker use, via the SAME mapper the view route effectively
       builds inline (see core/invoiceTemplates/fromInvoiceDoc.ts). Was:
       buildInvoiceTemplate()/generateInvoiceHTML() — an older, separate,
       simpler pair that never reflected a business's chosen layout or
       branding. Whatever renderInvoiceForBusiness() generates here is
       EXACTLY what gets uploaded below — no second, different HTML is
       ever produced for the same invoice.
    ========================================= */
    const businessIdForTemplate = String(invoiceDoc.businessId || order.businessId || "");
    const business = businessIdForTemplate
      ? await Business.findById(businessIdForTemplate).lean()
      : null;

    const renderData = buildRenderDataFromInvoice(
      invoiceDoc.toObject ? invoiceDoc.toObject() : invoiceDoc,
      { createdAt: order.createdAt, orderId: order.orderId, payment: order.payment },
      business as any
    );

    const html = await renderInvoiceForBusiness(businessIdForTemplate, renderData);

    /* =========================================
       UPLOAD TO CLOUDINARY — uploads exactly the `html` generated above,
       nothing else. Whatever renderInvoiceForBusiness() produced (the
       business's chosen layout + branding/text customization, or the
       platform default if none is saved) is the ONLY HTML this route ever
       builds or uploads.
    ========================================= */
      const buffer = Buffer.from(html, "utf-8");

     console.log("HTML SIZE:", html.length);

      const upload = await cloudinary.uploader.upload(
        `data:text/html;base64,${buffer.toString("base64")}`,
        {
          folder: "an-group/invoices",
          resource_type: "raw",
          public_id: `invoice_${invoiceNumber}`,
          overwrite: true,
        }
      );

    const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.angroup.in";

    const invoiceUrl = `${BASE_URL}/invoice/${invoiceNumber}`;

      order.invoice = {
        invoiceNumber,
        invoiceUrl,
      };

    /* =========================================
       SAVE IN ORDER
    ========================================= */
    order.invoice = {
      ...(order.invoice || {}),
      invoiceNumber,
      invoiceUrl,
      pdfGenerated: true,
      generatedAt: new Date(),
    };

    await order.save();

    logAction({
      action: "GENERATE",
      entity: "Order",
      entityId: order._id?.toString(),
      after: order,
      req,
      actor: { businessId: businessIdForTemplate },
    });

    return NextResponse.json({
      success: true,
      invoiceNumber,
      invoiceUrl,
      htmlLength: html.length,
    });
     } catch (err: any) {
     console.error("🔥 INVOICE ERROR:");
     console.error(err);
     console.error(err?.message);
     console.error(err?.stack);
   
     return NextResponse.json(
       {
         success: false,
         message: err?.message || "Internal Server Error",
         stack:
           process.env.NODE_ENV === "development"
             ? err?.stack
             : undefined,
       },
       { status: 500 }
     );
   }
}
