import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import SalesInvoice from "@/models/SalesInvoice";
import { resolveVendorContext } from "@/lib/auth/vendorContext";

/**
 * GET /api/vendor/invoices — the vendor's own B2B invoices (vendor -> this
 * business, generated automatically by dualInvoiceService.ts whenever one
 * of their products sells). /vendor/page.tsx has linked to /vendor/invoices
 * since it was built, but neither this route nor the page it points to
 * ever existed — a real dead link on the vendor's own dashboard.
 */
export async function GET(req: NextRequest) {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    // resolveVendorContext covers both the vendor Owner (User.role ===
    // "VENDOR") AND vendor-team staff/Managers (whose User.role is never
    // actually "VENDOR") -- a blunt x-user-role check here used to reject
    // every staff member outright before this even ran.
    const ctx = await resolveVendorContext(userId);
    if (!ctx) {
      return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const filter: Record<string, unknown> = {
      vendorId: (ctx.vendor as any)._id,
      invoiceType: "B2B",
    };
    if (status) filter.status = status;

    // Was hardcoded to fetch (and hydrate) up to 500 full invoices on every
    // load, with `summary` derived from that same capped array -- both the
    // list and the money totals silently went wrong for any vendor with
    // more than 500 invoices. Paginates the list (default 20/page) and
    // computes summary via a DB aggregate over the FULL filtered set, so
    // the totals stay correct regardless of page size.
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20));

    const [invoices, total, summaryAgg] = await Promise.all([
      SalesInvoice.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      SalesInvoice.countDocuments(filter),
      SalesInvoice.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalInvoiced: { $sum: "$grandTotal" },
            totalPaid: { $sum: { $cond: [{ $eq: ["$status", "PAID"] }, "$grandTotal", 0] } },
            outstanding: {
              $sum: {
                $cond: [{ $and: [{ $ne: ["$status", "PAID"] }, { $ne: ["$status", "CANCELLED"] }] }, "$grandTotal", 0],
              },
            },
          },
        },
      ]),
    ]);
    const summary = summaryAgg[0]
      ? { totalInvoiced: summaryAgg[0].totalInvoiced || 0, totalPaid: summaryAgg[0].totalPaid || 0, outstanding: summaryAgg[0].outstanding || 0 }
      : { totalInvoiced: 0, totalPaid: 0, outstanding: 0 };

    return NextResponse.json({ success: true, invoices, summary, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
