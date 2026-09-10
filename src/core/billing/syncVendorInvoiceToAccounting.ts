/**
 * Pushes a PAID VendorBillingInvoice (AN Group's own invoice TO a vendor
 * for their subscription) into AN Group's books in the separate AN
 * Accounting app, via that app's `/api/external/purchases` ingestion
 * endpoint (see accounting/src/app/api/external/purchases/route.ts).
 *
 * From the accounting app's point of view this invoice is a PURCHASE --
 * AN Group (the entity whose books the accounting app keeps) is the one
 * paying here, and the vendor is the supplier, so this is a cost coming
 * IN, not revenue going out, even though AN-CRM itself models it as AN
 * Group's own outward invoice TO the vendor. It used to be pushed to
 * `/api/external/sales` (AN Group's own outward revenue ingestion), which
 * silently booked every vendor subscription payment as AN Group's own
 * sales revenue -- fixed by switching to the dedicated purchase-side
 * endpoint and a vendor/invoice-shaped payload instead of the old
 * customer/lines/payment sales shape.
 *
 * Configuration (both required, or this is a silent no-op so nothing
 * breaks before it's set up):
 *   ACCOUNTING_API_URL  -- e.g. https://accounting.angroup.in
 *   ACCOUNTING_API_KEY  -- a per-business Bearer key generated from that
 *                          app's Settings > Sales API, for the "AN Group"
 *                          business in its own books.
 *
 * Idempotent on the accounting side (keyed by vendorGstin + invoiceNumber
 * now, not externalOrderId), so calling this more than once for the same
 * invoice (e.g. a retried webhook) never double-books it.
 *
 * Fire-and-forget by design: a slow/unreachable accounting app must never
 * block or fail vendor invoice activation, which is why every call site
 * wraps this in a .catch() (see the one below, which logs on final
 * failure rather than swallowing it silently).
 *
 * Retries transient failures (network errors, 5xx, 429) up to 3 attempts
 * with exponential backoff (~1s/3s/9s). Does NOT retry 401/403 -- those
 * mean the API key is wrong/revoked and need a human, not a retry loop.
 */
import Business from "@/models/Business";

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1000;
const BACKOFF_FACTOR = 3;

// Same GST-exclusive rate buildVendorBillingInvoiceView() (the invoice
// PDF/view path) backs out of invoice.amount -- keep in sync with that
// file's GST_RATE so the PDF a vendor sees and the figures pushed to the
// accounting app always agree.
const GST_RATE = 18;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function syncVendorInvoiceToAccounting(invoice: {
  _id: unknown;
  businessId: unknown;
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

  // The purchases endpoint requires a valid GSTIN for the vendor -- unlike
  // the old sales payload (where it was an optional customer field), there's
  // no graceful "Unknown"/omitted fallback here, so skip rather than send a
  // request that's guaranteed to fail validation.
  const vendorGstin = (vendor.gstNumber || "").trim().toUpperCase();
  if (!vendorGstin) {
    console.warn("[syncVendorInvoiceToAccounting] Skipping -- vendor has no GSTIN on file", {
      vendorInvoiceId: String(invoice._id),
      invoiceNumber: invoice.invoiceNumber,
    });
    return;
  }

  // Same intrastate/interstate CGST+SGST vs IGST split, and the same
  // "back the taxable value out of the GST-inclusive total" math, as
  // buildVendorBillingInvoiceView() uses to render this invoice's own
  // PDF/view (see app/api/invoice/view/[invoiceNumber]/vendorBillingView.ts)
  // -- VendorBillingInvoice itself only stores the single GST-inclusive
  // `amount`, no CGST/SGST/IGST split of its own, so this reconstructs it
  // the same way rather than inventing a second, potentially-diverging
  // calculation.
  const business = await Business.findById(invoice.businessId).select("state").lean<{ state?: string }>();
  const businessState = (business?.state || "").trim().toLowerCase();
  const vendorState = (vendor.address?.state || "").trim().toLowerCase();
  // No state on file for either side -- default to interstate (IGST)
  // rather than silently guessing intrastate and under-declaring.
  const isIntrastate = !!businessState && businessState === vendorState;

  const grandTotal = invoice.amount || 0;
  const taxableValue = Math.round((grandTotal / (1 + GST_RATE / 100)) * 100) / 100;
  const totalTax = Math.round((grandTotal - taxableValue) * 100) / 100;
  const cgst = isIntrastate ? Math.round((totalTax / 2) * 100) / 100 : 0;
  const sgst = isIntrastate ? Math.round((totalTax / 2) * 100) / 100 : 0;
  const igst = isIntrastate ? 0 : totalTax;

  const body = JSON.stringify({
    externalSource: "AN Group CRM",
    vendorGstin,
    vendorName: vendor.companyName || vendor.contactPerson || "Vendor",
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.paidAt || new Date(),
    taxableValue,
    cgst,
    sgst,
    igst,
    // AN-CRM doesn't track reverse-charge status for vendor billing
    // invoices (these are regular forward-charge subscription fees) --
    // default false rather than guessing.
    isReverseCharge: false,
  });

  let lastError: Error = new Error("Accounting sync failed: unknown error");

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/external/purchases`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body,
      });

      if (res.ok) {
        // { purchaseInvoiceId, invoiceNumber, total } -- nothing here needs
        // the id today (fire-and-forget, no return value used by callers),
        // but log it so a purchase invoice can be traced back from either
        // side if it's ever needed.
        const { purchaseInvoiceId } = await res.json().catch(() => ({}) as { purchaseInvoiceId?: string });
        console.log("[syncVendorInvoiceToAccounting] Purchase invoice recorded", {
          vendorInvoiceId: String(invoice._id),
          invoiceNumber: invoice.invoiceNumber,
          purchaseInvoiceId,
        });
        return;
      }

      const responseBody = await res.text().catch(() => "");

      // 401/403 means the API key is wrong or revoked -- a human needs to
      // fix that, retrying won't help.
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Accounting sync failed (${res.status} auth error, not retrying): ${responseBody}`);
      }

      // Other 4xx (e.g. validation errors), INCLUDING 409 (invoice already
      // exists under a non-MANUAL source, or voided -- unlikely on a
      // first-time push but possible on a retried webhook racing another
      // sync) aren't transient either -- the same payload will fail the
      // same way on retry, so surface it rather than looping.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new Error(`Accounting sync failed (${res.status}, not retrying): ${responseBody}`);
      }

      // 5xx / 429 -- transient, worth retrying.
      lastError = new Error(`Accounting sync failed (${res.status}): ${responseBody}`);
    } catch (err) {
      // A thrown non-retryable error (401/403/other 4xx) above should
      // propagate immediately rather than being retried.
      if (err instanceof Error && /not retrying/.test(err.message)) {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    if (attempt < MAX_ATTEMPTS) {
      await sleep(BASE_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt - 1));
    }
  }

  throw lastError;
}
