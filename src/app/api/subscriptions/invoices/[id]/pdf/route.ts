/**
 * GET /api/subscriptions/invoices/[id]/pdf — a print-ready HTML view of a
 * SubscriptionInvoice (AN-CRM's own plan-payment invoice, not a
 * SalesInvoice). The browser's own "Print > Save as PDF" is the PDF path
 * here, same workaround pattern already used elsewhere for GST-portal-
 * ready documents on this platform — no separate PDF-rendering dependency
 * needed for a one-page billing receipt.
 */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SubscriptionInvoice from "@/models/SubscriptionInvoice";
import Business from "@/models/Business";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

export const runtime = "nodejs";

export async function GET(req: Request, context: any) {
  await connectDB();
  const session = await getEnrichedSession();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const { id } = await context.params;
  const invoice = await SubscriptionInvoice.findById(id).lean<any>();
  if (!invoice || invoice.businessId.toString() !== session.business?.businessId) {
    return new NextResponse("Not found", { status: 404 });
  }
  const business = await Business.findById(invoice.businessId).select("name gstNumber address email phone").lean<any>();

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${invoice.invoiceNumber}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #1a1a1a; max-width: 720px; margin: 40px auto; padding: 0 20px; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .muted { color: #666; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-top: 24px; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid #eee; font-size: 14px; }
  th { color: #666; font-weight: 600; }
  .right { text-align: right; }
  .total-row td { font-weight: 700; font-size: 16px; border-top: 2px solid #333; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
  @media print { body { margin: 0; } }
</style></head>
<body>
  <div class="header">
    <div><h1>AN-CRM</h1><div class="muted">Subscription Invoice</div></div>
    <div class="right">
      <div><strong>${invoice.invoiceNumber}</strong></div>
      <div class="muted">${new Date(invoice.createdAt).toLocaleDateString('en-IN')}</div>
    </div>
  </div>
  <div class="muted">Billed to</div>
  <div><strong>${business?.name || ''}</strong></div>
  ${business?.gstNumber ? `<div class="muted">GSTIN: ${business.gstNumber}</div>` : ''}
  ${business?.address ? `<div class="muted">${business.address}</div>` : ''}
  <table>
    <thead><tr><th>Description</th><th>Period</th><th class="right">Amount</th></tr></thead>
    <tbody>
      <tr>
        <td>AN-CRM ${invoice.mode} — ${invoice.plan} plan (${invoice.billingPeriod.replace('_', '-')})</td>
        <td>${new Date(invoice.periodStart).toLocaleDateString('en-IN')} – ${new Date(invoice.periodEnd).toLocaleDateString('en-IN')}</td>
        <td class="right">₹${invoice.amount.toLocaleString('en-IN')}</td>
      </tr>
      <tr><td></td><td>GST (18%, included)</td><td class="right">₹${invoice.taxTotal.toLocaleString('en-IN')}</td></tr>
      <tr class="total-row"><td></td><td>Total (paid)</td><td class="right">₹${invoice.grandTotal.toLocaleString('en-IN')}</td></tr>
    </tbody>
  </table>
  <p class="muted" style="margin-top:24px;">Payment reference: ${invoice.razorpayPaymentId}. This is a computer-generated invoice for AN-CRM platform subscription fees.</p>
  <script>window.onload = () => window.print()</script>
</body></html>`;

  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
