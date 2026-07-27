import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import crypto from "crypto";
// Was a second, inline `mongoose.Schema`/`mongoose.model("SalesInvoice", ...)`
// defined right in this route file -- a duplicate of src/models/SalesInvoice.ts
// with a materially different (older/flatter) shape missing invoiceType,
// sourceOrderId, businessId's real type, and the GST-breakdown fields.
// Because `mongoose.models.SalesInvoice || mongoose.model(...)` only
// registers once per process, whichever module happened to import first
// won the registration for the entire app; if this route's module loaded
// before models/SalesInvoice.ts did, every other route reading
// `mongoose.models.SalesInvoice` afterwards would silently get this
// incomplete shape instead. Use the canonical model instead.
import SalesInvoice from "@/models/SalesInvoice";

/* ── POST — generate a public share link (72h) ───────────── */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    await connectDB();

    const token = crypto.randomBytes(24).toString("hex");
    const expiry = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours

    const invoice = await SalesInvoice.findByIdAndUpdate(
      id,
      { shareToken: token, shareExpiry: expiry, status: "SENT" },
      { new: true }
    ).lean();

    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const shareUrl = `${base}/invoice/view/${token}`;

    return NextResponse.json({ success: true, shareUrl, expiresAt: expiry });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
