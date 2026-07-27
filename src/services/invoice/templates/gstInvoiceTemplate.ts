export function gstInvoiceTemplate(invoice: any) {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Invoice ${invoice.invoiceNumber}</title>

<style>
  body { font-family: Arial; padding: 30px; color: #111; }
  .header { text-align: center; margin-bottom: 20px; }
  .box { border: 1px solid #ddd; padding: 15px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ddd; padding: 8px; font-size: 13px; }
  th { background: #f5f5f5; }
  .right { text-align: right; }
  .totalBox { margin-top: 20px; font-size: 16px; font-weight: bold; }
</style>

</head>

<body>

<div class="header">
  <h2>${invoice.businessName || "AN GROUP"}</h2>
  <div>GSTIN: ${invoice.businessGST || "N/A"}</div>
  <div>${invoice.businessAddress || ""}</div>
</div>

<div class="box">
  <b>Invoice No:</b> ${invoice.invoiceNumber}<br/>
  <b>Date:</b> ${new Date(invoice.createdAt).toLocaleDateString()}<br/>
  <b>Customer:</b> ${invoice.customer.name}<br/>
  <b>Phone:</b> ${invoice.customer.phone}<br/>
  <b>State:</b> ${invoice.customer.state}
</div>

<table>
<thead>
<tr>
  <th>Item</th>
  <th>HSN</th>
  <th>Qty</th>
  <th>Price</th>
  <th>Taxable</th>
  <th>GST</th>
  <th>Total</th>
</tr>
</thead>

<tbody>
${invoice.items
  .map(
    (i: any) => `
<tr>
  <td>${i.name}</td>
  <td>${i.hsn || ""}</td>
  <td>${i.qty}</td>
  <td>${i.price}</td>
  <td>${i.taxableValue}</td>
  <td>${i.gstPercent}%</td>
  <td>${i.total}</td>
</tr>
`
  )
  .join("")}
</tbody>
</table>

<div class="totalBox">
Subtotal: ₹${invoice.subtotal}<br/>
CGST: ₹${invoice.cgst}<br/>
SGST: ₹${invoice.sgst}<br/>
IGST: ₹${invoice.igst}<br/>
<h3>Grand Total: ₹${invoice.grandTotal}</h3>
</div>

<p style="margin-top:30px;font-size:12px;">
This is a computer generated GST invoice.
</p>

</body>
</html>
`;
}
