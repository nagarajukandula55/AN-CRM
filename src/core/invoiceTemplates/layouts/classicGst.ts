/**
 * "Classic GST" layout — a server-HTML port of the EXISTING ecommerce
 * invoice design at app/invoice/[invoiceNumber]/page.tsx (the one the user
 * pointed at as "the invoice page I'm using for current ecommerce"). This
 * is deliberately the closest possible match to that page's structure and
 * CSS, ported to a plain HTML-string renderer so it can ALSO be used by
 * the Cloudinary-snapshot / server-side generation path (which never ran
 * React) — and set as the platform default so nothing visually changes
 * for existing invoices unless an admin picks a different layout.
 */

import type { InvoiceLayout, InvoiceRenderData } from "../types";
import { esc, fmtMoney, fmtDate, safeStr, totals } from "../helpers";

function render(data: InvoiceRenderData): string {
  const isB2B = data.type === "B2B";
  const accent = esc(data.templateConfig?.accentColor || "#111827");
  const t = totals(data);

  const itemsRows = (data.items || [])
    .map(
      (i, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${safeStr(i.name, "")}</td>
      <td>${safeStr(i.hsn, "")}</td>
      <td>${safeStr(i.qty, "0")}</td>
      <td>₹${fmtMoney(i.rate)}</td>
      <td>₹${fmtMoney(i.discount)}</td>
      <td>₹${fmtMoney(i.taxable)}</td>
      <td>${safeStr(i.gstPercent, "0")}%</td>
      <td>₹${fmtMoney(i.cgst)}</td>
      <td>₹${fmtMoney(i.sgst)}</td>
      <td>₹${fmtMoney(i.igst)}</td>
      <td>₹${fmtMoney(i.total)}</td>
    </tr>`
    )
    .join("");

  const hsnSummaryHtml = isB2B && data.hsnSummary?.length
    ? `<div class="hsnSummary">${data.hsnSummary
        .map((r) => `<div>HSN ${esc(r.hsn)} - ₹${fmtMoney(r.taxable)}</div>`)
        .join("")}</div>`
    : "";

  const signatureHtml = data.templateConfig?.showSignature !== false
    ? `<div class="signatureArea">
        ${data.templateConfig?.signatureImageUrl ? `<img src="${esc(data.templateConfig.signatureImageUrl)}" alt="signature" class="signatureImage" />` : ""}
        <div class="signatoryText">${safeStr(data.templateConfig?.signatoryLabel, "Authorized Signatory")}</div>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Invoice ${esc(data.invoiceNumber)}</title>
<style>
.page{max-width:950px;margin:10px auto;padding:12px;font-family:Arial,sans-serif;color:#000;background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.08);font-size:11px;}
.invoiceTitle{text-align:center;font-size:24px;font-weight:800;color:${accent};margin-bottom:12px;letter-spacing:1px;}
.header{display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:10px;gap:12px;}
.companyCard{flex:0.45;align-self:flex-start;background:#f8fafc;padding:14px;border-radius:10px;border:1px solid #e5e7eb;line-height:1.4;font-size:11px;max-width:320px;}
.companyLogo{max-height:48px;margin-bottom:8px;}
.companyName{font-size:18px;font-weight:700;margin-bottom:10px;}
.invoiceBox{border:1px solid #000;padding:10px;border-radius:8px;background:#fff;color:#000;min-width:260px;line-height:1.35;font-size:12px;}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:8px;padding-bottom:8px;border-bottom:1px solid #000;}
.box{padding:6px 10px;font-size:11px;line-height:1.4;}
.sectionTitle{font-size:12px;font-weight:700;margin-bottom:6px;border-bottom:1px solid #ddd;padding-bottom:3px;}
.productHeader{margin-top:12px;padding-top:8px;border-top:1px solid #000;font-size:14px;font-weight:700;text-decoration:underline;margin-bottom:8px;}
.table{width:100%;border-collapse:collapse;margin-top:10px;}
.table th{background:${accent};color:#fff;border:1px solid #000;padding:7px;font-size:10px;font-weight:700;text-align:center;white-space:nowrap;}
.table td{border:1px solid #000;padding:5px;font-size:10px;text-align:center;vertical-align:middle;}
.table td:nth-child(2){text-align:left;padding-left:8px;width:35%;}
.table tbody tr:nth-child(even){background:#fafafa;}
.hsnSummary{margin-top:10px;border-top:1px solid #ccc;padding-top:10px;font-size:11px;}
.summaryRow{display:flex;justify-content:space-between;gap:20px;margin-top:20px;}
.summary{width:60%;border:1px solid #000;border-radius:10px;padding:15px;line-height:2;margin-left:auto;}
.grand{font-size:16px;font-weight:bold;margin-top:10px;}
.signatureArea{width:60%;margin-left:auto;text-align:right;margin-top:10px;}
.signatureImage{height:85px;object-fit:contain;display:block;margin-left:auto;}
.signatoryText{margin-top:3px;font-size:12px;font-weight:600;}
.footer{text-align:center;margin-top:20px;font-size:12px;}
.declaration{margin-top:20px;border-top:1px solid #ddd;padding-top:15px;font-size:12px;}
@media print{body{background:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}.page{box-shadow:none!important;border:none!important;margin:0!important;max-width:100%!important;}.table th{background:${accent}!important;color:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
</style></head>
<body><div class="page">
<div class="invoiceTitle">TAX INVOICE</div>
<div class="header">
  <div class="companyCard">
    ${data.company.logoUrl ? `<img src="${esc(data.company.logoUrl)}" class="companyLogo" alt="logo"/>` : ""}
    <div class="companyName">${safeStr(data.company.name)}</div>
    <div>${safeStr(data.company.tagline, "")}</div>
    <div>${safeStr(data.company.address1, "")}</div>
    <div>${safeStr(data.company.address2, "")}</div>
    <div>${safeStr(data.company.city, "")}, ${safeStr(data.company.state, "")}</div>
    <div>GSTIN: ${safeStr(data.company.gstin)}</div>
    <div>Phone: ${safeStr(data.company.phone)}</div>
  </div>
  <div class="invoiceBox">
    <div><b>Invoice No:</b> ${safeStr(data.invoiceNumber)}</div>
    <div><b>Invoice Date:</b> ${fmtDate(data.invoiceDate)}</div>
    <div><b>Order Date:</b> ${fmtDate(data.orderDate)}</div>
    <div><b>Order ID:</b> ${safeStr(data.orderId)}</div>
    <div><b>Invoice Type:</b> ${isB2B ? "B2B" : "B2C"}</div>
  </div>
</div>
<div class="grid3">
  <div class="box">
    <div class="sectionTitle">BILL TO</div>
    <div>${safeStr(data.customer.name)}</div>
    <div>${safeStr(data.customer.phone)}</div>
    <div>${safeStr(data.customer.address)}</div>
    <div>City: ${safeStr(data.customer.city)}</div>
    <div>State: ${safeStr(data.customer.state)}</div>
    <div>PIN: ${safeStr(data.customer.pincode)}</div>
    ${isB2B ? `<div>GSTIN: ${safeStr(data.customer.gstin)}</div><div>State Code: ${safeStr(data.customer.stateCode)}</div>` : ""}
  </div>
  <div class="box">
    <div class="sectionTitle">SHIP TO</div>
    <div>${safeStr(data.shipping?.name || data.customer.name)}</div>
    <div>${safeStr(data.shipping?.phone || data.customer.phone)}</div>
    <div>${safeStr(data.shipping?.address || data.customer.address)}</div>
    <div>City: ${safeStr(data.shipping?.city || data.customer.city)}</div>
    <div>State: ${safeStr(data.shipping?.state || data.customer.state)}</div>
    <div>PIN: ${safeStr(data.shipping?.pincode || data.customer.pincode)}</div>
  </div>
  <div class="box">
    <div class="sectionTitle">PAYMENT</div>
    <div><b>Method:</b> ${safeStr(data.payment?.method)}</div>
    <div><b>Status:</b> ${safeStr(data.payment?.status)}</div>
    <div>Transaction: ${safeStr(data.payment?.transactionId)}</div>
  </div>
</div>
<div class="productHeader">PRODUCT DETAILS</div>
<table class="table">
<thead><tr><th>#</th><th>Product</th><th>HSN</th><th>Qty</th><th>Rate</th><th>Discount</th><th>Taxable</th><th>GST%</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Total</th></tr></thead>
<tbody>${itemsRows}
<tr><td colspan="6" style="text-align:center;font-weight:700;">Total</td><td style="text-align:center;font-weight:700;">₹${t.taxable}</td><td></td><td style="text-align:center;">₹${t.cgst}</td><td style="text-align:center;">₹${t.sgst}</td><td style="text-align:center;">₹${t.igst}</td><td style="text-align:center;font-weight:700;">₹${t.grandTotal}</td></tr>
</tbody></table>
${hsnSummaryHtml}
<div class="summaryRow">
  <div style="width:60%;">
    <div><b>Place of Supply:</b> ${safeStr(data.placeOfSupply)}</div>
    <div><b>State Code:</b> ${safeStr(data.stateCode)}</div>
    <div><b>Supply Type:</b> ${isB2B ? "B2B" : "B2C"}</div>
    <div><b>Reverse Charge:</b> No</div>
  </div>
</div>
<div class="summary">
  <div>Taxable Amount : ₹${t.taxable}</div>
  <div>Discount : ₹${t.discount}</div>
  <div>CGST : ₹${t.cgst}</div>
  <div>SGST : ₹${t.sgst}</div>
  <div>IGST : ₹${t.igst}</div>
  <div class="grand">Grand Total : ₹${t.grandTotal}</div>
</div>
${signatureHtml}
<div class="footer">${safeStr(data.templateConfig?.footerNote, "This is a computer generated GST invoice.")}</div>
<div class="declaration"><b>Declaration</b><p>${safeStr(data.templateConfig?.declaration, "Certified that the particulars given above are true and correct. This invoice is generated electronically and does not require a physical signature.")}</p>
${data.templateConfig?.termsAndConditions ? `<b>Terms &amp; Conditions</b><p>${esc(data.templateConfig.termsAndConditions)}</p>` : ""}
</div>
</div></body></html>`;
}

export const classicGstLayout: InvoiceLayout = {
  key: "classic-gst",
  label: "Classic GST",
  description: "The original detailed tax-invoice layout — bill-to/ship-to/payment grid, full GST breakdown table, HSN summary for B2B, QR + declaration.",
  renderHTML: render,
};
