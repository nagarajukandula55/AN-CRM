import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import SalesInvoice from "@/models/SalesInvoice";
import SalesDocument from "@/models/SalesDocument";
import { resolveVendorContext } from "@/lib/auth/vendorContext";
import { vendorHasModule } from "@/core/access/vendorAccess.service";

/**
 * GET /api/vendor/ledger?from=&to=&customer= — party-wise ledger, grouped
 * by customer (keyed on phone, falling back to name -- SalesInvoice's
 * `customer` is an embedded snapshot with no stable customerId ref, so
 * phone is the closest thing to a stable identity already captured on
 * every invoice/document). Without `customer`, returns the list of
 * distinct customers with their outstanding balance, so the vendor picks
 * one to drill into (a second call with `customer=` returns that party's
 * full running-balance ledger, same shape /vendor/statement already
 * established for the vendor-wide version of this).
 */
export async function GET(req: NextRequest) {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    await connectDB();
    const ctx = await resolveVendorContext(userId);
    if (!ctx) return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });
    const vendorId = (ctx.vendor as any)._id;

    // Ledger Book is an Ultimate-only feature (see core/pricing/plans.ts) --
    // the vendor-portal nav already hides this page for Pro, but the API
    // itself had no check, so the URL could be hit directly to bypass it.
    const allowed = await vendorHasModule(String((ctx.vendor as any).businessId), String(vendorId), "finance-advanced", (ctx.vendor as any).appliedAs);
    if (!allowed) {
      return NextResponse.json({ success: false, message: "Ledger Book is available on the Ultimate plan." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");
    const customerKey = searchParams.get("customer") || undefined;

    const dateFilter: Record<string, any> = {};
    if (fromStr) dateFilter.$gte = new Date(fromStr);
    if (toStr) {
      const toDate = new Date(toStr);
      toDate.setHours(23, 59, 59, 999);
      dateFilter.$lte = toDate;
    }

    const invoiceFilter: Record<string, any> = { vendorId, isDeleted: { $ne: true } };
    if (Object.keys(dateFilter).length) invoiceFilter.createdAt = dateFilter;
    const invoices = await SalesInvoice.find(invoiceFilter)
      .select("invoiceNumber customer grandTotal status paidAt paidAmount createdAt")
      .sort({ createdAt: 1 })
      .lean();

    const noteFilter: Record<string, any> = {
      vendorId,
      isDeleted: { $ne: true },
      docType: { $in: ["CREDIT_NOTE", "DEBIT_NOTE"] },
    };
    if (Object.keys(dateFilter).length) noteFilter.createdAt = dateFilter;
    const notes = await SalesDocument.find(noteFilter)
      .select("docNumber docType customer grandTotal createdAt")
      .sort({ createdAt: 1 })
      .lean();

    const keyOf = (c: any) => (c?.phone || c?.name || "unknown").trim().toLowerCase();

    if (!customerKey) {
      // Party summary list -- one row per distinct customer with their
      // net outstanding balance across the range.
      const parties = new Map<string, { name: string; phone?: string; invoiced: number; paid: number; credited: number }>();
      for (const inv of invoices as any[]) {
        const key = keyOf(inv.customer);
        const p = parties.get(key) || { name: inv.customer?.name || "Unknown", phone: inv.customer?.phone, invoiced: 0, paid: 0, credited: 0 };
        p.invoiced += inv.grandTotal || 0;
        if (inv.status === "PAID") p.paid += inv.paidAmount || inv.grandTotal || 0;
        parties.set(key, p);
      }
      for (const n of notes as any[]) {
        const key = keyOf(n.customer);
        const p = parties.get(key) || { name: n.customer?.name || "Unknown", phone: n.customer?.phone, invoiced: 0, paid: 0, credited: 0 };
        if (n.docType === "CREDIT_NOTE") p.credited += n.grandTotal || 0;
        else p.invoiced += n.grandTotal || 0; // debit note adds to what's owed
        parties.set(key, p);
      }

      const summary = Array.from(parties.entries()).map(([key, p]) => ({
        key,
        name: p.name,
        phone: p.phone,
        balance: p.invoiced - p.paid - p.credited,
      }));
      summary.sort((a, b) => b.balance - a.balance);

      return NextResponse.json({ success: true, parties: summary });
    }

    // Single-party running-balance ledger.
    type TxEntry = { date: string; type: "Invoice" | "Payment" | "Credit Note" | "Debit Note"; reference: string; description: string; amount: number; sortDate: Date };
    const rows: TxEntry[] = [];
    let partyName = "";
    let partyPhone: string | undefined;

    for (const inv of invoices as any[]) {
      if (keyOf(inv.customer) !== customerKey) continue;
      partyName = inv.customer?.name || partyName;
      partyPhone = inv.customer?.phone || partyPhone;
      rows.push({
        date: new Date(inv.createdAt).toISOString(),
        type: "Invoice",
        reference: inv.invoiceNumber || "",
        description: "Sales Invoice",
        amount: inv.grandTotal || 0,
        sortDate: new Date(inv.createdAt),
      });
      if (inv.status === "PAID") {
        rows.push({
          date: new Date(inv.paidAt || inv.createdAt).toISOString(),
          type: "Payment",
          reference: inv.invoiceNumber || "",
          description: "Payment received",
          amount: -(inv.paidAmount || inv.grandTotal || 0),
          sortDate: new Date(inv.paidAt || inv.createdAt),
        });
      }
    }
    for (const n of notes as any[]) {
      if (keyOf(n.customer) !== customerKey) continue;
      partyName = n.customer?.name || partyName;
      partyPhone = n.customer?.phone || partyPhone;
      const isCredit = n.docType === "CREDIT_NOTE";
      rows.push({
        date: new Date(n.createdAt).toISOString(),
        type: isCredit ? "Credit Note" : "Debit Note",
        reference: n.docNumber || "",
        description: isCredit ? "Credit Note issued" : "Debit Note issued",
        amount: isCredit ? -(n.grandTotal || 0) : n.grandTotal || 0,
        sortDate: new Date(n.createdAt),
      });
    }

    rows.sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());
    let runningBalance = 0;
    const transactions = rows.map((r) => {
      runningBalance += r.amount;
      return { date: r.date, type: r.type, reference: r.reference, description: r.description, amount: r.amount, balance: runningBalance };
    });

    return NextResponse.json({
      success: true,
      party: { name: partyName, phone: partyPhone },
      transactions,
      closingBalance: runningBalance,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
