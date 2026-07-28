/**
 * UPI payment QR code generation for printed invoices -- per explicit
 * direction ("in the invoice add an option to add QR as well for the
 * payment which is made by their UPI Id"). Generates a standard UPI deep
 * link (the same `upi://pay?...` format every UPI app -- GPay/PhonePe/
 * Paytm/BHIM -- already recognizes when scanned) as a QR code data URL.
 *
 * No payment gateway, no webhook, no reconciliation -- this is a
 * "workaround" (their word) for accepting UPI payment against an invoice
 * without a bank integration: the customer scans, pays directly to the
 * business's own UPI VPA, and reconciliation stays manual (matching the
 * amount paid against the invoice) until a real banking/payment-gateway
 * integration exists -- see PROGRESS.md's banking-system plan for the
 * next step beyond this.
 */

import QRCode from "qrcode";

export interface UpiQrInput {
  vpa: string; // e.g. "business@okhdfcbank"
  payeeName: string;
  amount: number;
  invoiceNumber: string;
}

/** Builds the standard UPI deep link string every UPI app recognizes. */
export function buildUpiLink({ vpa, payeeName, amount, invoiceNumber }: UpiQrInput): string {
  const params = new URLSearchParams({
    pa: vpa,
    pn: payeeName,
    am: amount.toFixed(2),
    cu: "INR",
    tn: `Invoice ${invoiceNumber}`,
  });
  return `upi://pay?${params.toString()}`;
}

/** Returns a data: URL (PNG) ready to drop straight into an <img src>. */
export async function generateUpiQrDataUrl(input: UpiQrInput): Promise<string> {
  const link = buildUpiLink(input);
  return QRCode.toDataURL(link, { margin: 1, width: 240 });
}
