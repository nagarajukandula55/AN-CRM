import { renderEmailShell, emailButton, emailInfoBox } from "./emailShell";

export function buildInvoiceEmailTemplate({
  customerName,
  invoiceNumber,
  pdfUrl,
  grandTotal,
}: any) {
  return renderEmailShell({
    heading: "Your invoice is ready",
    previewText: `Invoice ${invoiceNumber} — ₹${grandTotal}`,
    bodyHtml: `
      <p>Hi ${customerName},</p>
      <p>Your invoice has been generated successfully.</p>
      ${emailInfoBox([
        { label: "Invoice number", value: invoiceNumber },
        { label: "Total amount", value: `₹${grandTotal}` },
      ])}
      ${pdfUrl ? `<div style="text-align:center;margin:24px 0;">${emailButton("Download invoice", pdfUrl)}</div>` : ""}
      <p style="font-size:13px;color:#8B8F94;">Thank you for your business.</p>
    `,
  });
}
