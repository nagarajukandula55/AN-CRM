export function buildInvoiceEmailTemplate({
  customerName,
  invoiceNumber,
  pdfUrl,
  amount,
}: any) {
  return `
    <div style="font-family: Arial; padding: 20px;">
      <h2>Invoice Generated</h2>

      <p>Hi <b>${customerName}</b>,</p>

      <p>Your invoice <b>${invoiceNumber}</b> has been generated successfully.</p>

      <p><b>Total Amount:</b> ₹${amount}</p>

      <a href="${pdfUrl}" style="
        display:inline-block;
        padding:10px 15px;
        background:#000;
        color:#fff;
        text-decoration:none;
        border-radius:6px;
        margin-top:10px;
      ">
        Download Invoice
      </a>

      <p style="margin-top:20px;">Thank you for shopping with us 🙌</p>
    </div>
  `;
}
