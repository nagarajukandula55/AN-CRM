import { NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";

export const runtime = "nodejs";

export async function GET(req: Request, context: any) {
  try {
    const invoiceNumber = context?.params?.invoiceNumber;

    if (!invoiceNumber) {
      return NextResponse.json(
        { success: false, message: "Missing invoiceNumber" },
        { status: 400 }
      );
    }

    const publicId = `an-group/invoices/invoice_${invoiceNumber}`;

    const url = cloudinary.url(publicId, {
      resource_type: "raw",
      type: "upload",
      secure: true,
    });

    // ❗ IMPORTANT CHANGE: return HTML page instead of redirect
    const html = await fetch(url).then(r => r.text());

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message },
      { status: 500 }
    );
  }
}
