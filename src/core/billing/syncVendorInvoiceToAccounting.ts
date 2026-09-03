/**
 * Pushes a PAID VendorBillingInvoice (AN Group's own invoice TO a vendor
 * for their subscription) into AN Group's books in the separate AN
 * Accounting app, via that app's `/api/external/sales` ingestion endpoint
 * (see accounting/src/app/api/external/sales/route.ts) -- per explicit
 * direction ("invoices between vendor and AN Group also need to be
 * connected to AN accounting platform").
 *
 * Configuration (both required, or this is a silent no-op so nothing
 * breaks before it's set up):
 *   ACCOUNTING_API_URL  -- e.g. https://accounting.angroup.in
 *   ACCOUNTING_API_KEY  -- a per-business Bearer key generated from that
 *                          app's Settings > Sales API, for the "AN Group"
 *                          business in its own books.
 *
 * Idempotent on the accounting side (keyed by externalOrderId = this
 * invoice's Mongo _id), so calling this more than once for the same
 * invoice (e.g. a retried webhook) never double-books it.
 *
 * Fire-and-forget by design: a slow/unreachable accounting app must never
 * block or fail vendor invoice activation, which is why every call site
 * wraps this in .catch(() => {}).
 */
export async function syncVendorInvoiceToAccounting(invoice: {
  _id: unknown;
  invoiceNumber: string;
  amount: number;
  planName: string | null;
  paidAt: Date | null;
  gatewayPaymentId: string;
}, vendor: {
  companyName?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  gstNumber?: string;
  address?: { state?: string };
}): Promise<void> {
  const apiUrl = process.env.ACCOUNTING_API_URL;
  const apiKey = process.env.ACCOUNTING_API_KEY;
  if (!apiUrl || !apiKey) return; // Not configured yet -- no-op.

  const res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/external/sales`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      externalOrderId: String(invoice._id),
      externalSource: "AN Group CRM",
      customer: {
        name: vendor.companyName || vendor.contactPerson || "Vendor",
        email: vendor.email || undefined,
        phone: vendor.phone || undefined,
        gstin: vendor.gstNumber || undefined,
        // Required by the accounting app's schema -- best-effort fallback
        // since not every vendor has a resolvable state on file.
        state: vendor.address?.state || "Unknown",
      },
      lines: [
        {
          description: `${invoice.planName || "Subscription"} — ${invoice.invoiceNumber}`,
          quantity: 1,
          rate: invoice.amount,
          // VendorBillingInvoice.amount carries no GST split of its own
          // today -- pushed as a plain 0%-tax line until this app's own
          // billing gains a real GST breakdown for these invoices.
          gstRatePercent: 0,
        },
      ],
      payment: invoice.paidAt
        ? {
            amount: invoice.amount,
            method: "OTHER",
            reference: invoice.gatewayPaymentId || undefined,
            date: invoice.paidAt,
          }
        : undefined,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Accounting sync failed (${res.status}): ${body}`);
  }
}
