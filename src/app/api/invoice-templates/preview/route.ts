import { NextRequest, NextResponse } from "next/server";
import { getLayout } from "@/core/invoiceTemplates/registry";
import type { InvoiceRenderData } from "@/core/invoiceTemplates/types";

/**
 * POST /api/invoice-templates/preview
 * Renders a layout against SAMPLE invoice data plus whatever branding/text
 * the admin editor currently has unsaved in its form — lets an admin see
 * what a template looks like before saving it. Returns raw HTML (not
 * JSON), so the editor UI can drop it straight into an <iframe srcDoc>.
 * Body: { layoutKey, branding?, text? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { layoutKey, branding, text } = body;

    const layout = getLayout(layoutKey);

    const sampleData: InvoiceRenderData = {
      invoiceNumber: "INV/2026-27/0001",
      invoiceDate: new Date().toISOString(),
      orderDate: new Date().toISOString(),
      orderId: "ORD-SAMPLE-001",
      type: "B2C",
      company: {
        name: "Sample Business Pvt Ltd",
        tagline: branding?.tagline || "",
        address1: "123 Business Park",
        address2: "Industrial Area",
        city: "Mumbai",
        state: "Maharashtra",
        gstin: "27ABCDE1234F1Z5",
        phone: "+91 98765 43210",
        logoUrl: branding?.logoUrl,
      },
      customer: {
        name: "Jane Customer",
        phone: "+91 91234 56789",
        address: "456 Residency Road",
        city: "Pune",
        state: "Maharashtra",
        pincode: "411001",
        gstin: "27XYZAB5678C1Z9",
        stateCode: "27",
      },
      shipping: {
        name: "Jane Customer",
        phone: "+91 91234 56789",
        address: "456 Residency Road",
        city: "Pune",
        state: "Maharashtra",
        pincode: "411001",
      },
      payment: { method: "ONLINE", status: "PAID", transactionId: "pay_sample123" },
      items: [
        { name: "Sample Product A", hsn: "1234", qty: 2, rate: 500, discount: 0, taxable: 1000, gstPercent: 18, cgst: 90, sgst: 90, igst: 0, total: 1180 },
        { name: "Sample Product B", hsn: "5678", qty: 1, rate: 750, discount: 50, taxable: 700, gstPercent: 18, cgst: 63, sgst: 63, igst: 0, total: 826 },
      ],
      summary: { subtotal: 1750, discount: 50, taxable: 1700, cgst: 153, sgst: 153, igst: 0, grandTotal: 2006 },
      placeOfSupply: "Maharashtra",
      stateCode: "27",
      supplyType: "Consumer",
      templateConfig: {
        accentColor: branding?.accentColor,
        footerNote: text?.footerNote,
        declaration: text?.declaration,
        termsAndConditions: text?.termsAndConditions,
        showSignature: text?.showSignature,
        signatureImageUrl: text?.signatureImageUrl,
        signatoryLabel: text?.signatoryLabel,
      },
    };

    const html = layout.renderHTML(sampleData);
    return new NextResponse(html, { headers: { "content-type": "text/html" } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
