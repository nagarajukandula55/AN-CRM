export function buildInvoiceEmailTemplate({
  customerName,
  invoiceNumber,
  pdfUrl,
  grandTotal,
  orderId,
}: any) {
  return `
  <div style="font-family:Arial;background:#f6f6f6;padding:40px;">
    
    <div style="max-width:600px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;">
      
      <!-- HEADER -->
      <div style="background:#111;color:#fff;padding:20px;text-align:center;">
        <h2 style="margin:0;">AN Group</h2>
        <p style="margin:5px 0;font-size:12px;">Tax Invoice Notification</p>
      </div>

      <!-- BODY -->
      <div style="padding:30px;">
        
        <h3 style="margin-bottom:10px;">Hello ${customerName || "Customer"},</h3>

        <p style="color:#555;line-height:1.6;">
          Your order has been successfully processed and your invoice is now ready.
        </p>

        <!-- INVOICE CARD -->
        <div style="border:1px solid #eee;border-radius:10px;padding:15px;margin:20px 0;">
          
          <p style="margin:5px 0;"><b>Invoice No:</b> ${invoiceNumber}</p>
          <p style="margin:5px 0;"><b>Order ID:</b> ${orderId}</p>
          <p style="margin:5px 0;"><b>Total Amount:</b> ₹${grandTotal}</p>

        </div>

        <!-- CTA BUTTON -->
        <div style="text-align:center;margin:25px 0;">
          <a href="${pdfUrl}" 
             style="background:#000;color:#fff;padding:12px 20px;
                    text-decoration:none;border-radius:8px;display:inline-block;">
            Download Invoice
          </a>
        </div>

        <p style="font-size:12px;color:#888;line-height:1.5;">
          This invoice is generated automatically. If you have any questions,
          please contact support.
        </p>

      </div>

      <!-- FOOTER -->
      <div style="background:#fafafa;padding:15px;text-align:center;font-size:11px;color:#777;">
        © ${new Date().getFullYear()} AN Group • All rights reserved
      </div>

    </div>
  </div>
  `;
}
