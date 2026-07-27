/**
 * "Minimal" layout — a compact, single-column invoice with a slimmer item
 * table (no per-line CGST/SGST/IGST split, just tax% and total — the full
 * breakdown still shows once in the summary block). Good for businesses
 * that want a cleaner customer-facing document without the dense grid
 * "Classic GST" uses.
 */

import type { InvoiceLayout, InvoiceRenderData } from "../types";
import { esc, fmtMoney, fmtDate, safeStr, totals } from "../helpers";

function render(data: InvoiceRenderData): string {
  const isB2B = data.type === "B2B";
  const accent = esc(data.templateConfig?.accentColor || "#0f766e");
  const t = totals(data);

  const itemsRows = (data.items || [])
    .map(
      (i, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${safeStr(i.name, "")}<br/><span class="hsn">HSN ${safeStr(i.hsn, "-")}</span></td>
      <td>${safeStr(i.qty, "0")}</td>
      <td>₹${fmtMoney(i.rate)}</td>
      <td>${safeStr(i.gstPercent, "0")}%</td>
      <td>₹${fmtMoney(i.total)}</td>
    </tr>`
    )
    .join("");

  const signatureHtml = data.templateConfig?.showSignature !== false
    ? `<div class="signature">
        ${data.templateConfig?.signatureImageUrl ? `<img src="${esc(data.templateConfig.signatureImageUrl)}" alt="signature"/>` : ""}
        <div>${safeStr(data.templateConfig?.signatoryLabel, "Authorized Signatory")}</div>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Invoice ${esc(data.invoiceNumber)}</title>
<style>
body{margin:0;background:#f5f5f5;}
.page{max-width:720px;margin:20px auto;padding:36px;font-family:'Helvetica Neue',Arial,sans-serif;color:#1f2937;background:#fff;font-size:12px;}
.topRow{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;}
.logo{max-height:40px;margin-bottom:8px;}
.companyName{font-size:20px;font-weight:600;color:${accent};}
.muted{color:#6b7280;font-size:11px;}
.invoiceMeta{text-align:right;font-size:11px;line-height:1.7;}
.invoiceMeta .num{font-size:16px;font-weight:700;color:${accent};}
.divider{border:none;border-top:1px solid #e5e7eb;margin:18px 0;}
.parties{display:flex;justify-content:space-between;gap:24px;margin-bottom:20px;}
.party{flex:1;font-size:11px;line-height:1.6;}
.party .label{text-transform:uppercase;letter-spacing:.05em;font-size:9px;color:#9ca3af;margin-bottom:4px;}
table{width:100%;border-collapse:collapse;margin-top:8px;}
thead th{text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.04em;color:#9ca3af;border-bottom:2px solid #e5e7eb;padding:8px 6px;}
tbody td{padding:10px 6px;border-bottom:1px solid #f3f4f6;font-size:11px;vertical-align:top;}
.hsn{color:#9ca3af;font-size:9px;}
.totalsBox{margin-left:auto;width:260px;margin-top:16px;font-size:11px;line-height:1.9;}
.totalsBox .grand{font-size:15px;font-weight:700;color:${accent};border-top:2px solid ${accent};padding-top:8px;margin-top:6px;}
.signature{margin-top:36px;text-align:right;font-size:11px;}
.signature img{height:60px;display:block;margin-left:auto;}
.footerNote{margin-top:32px;font-size:10px;color:#9ca3af;text-align:center;}
@media print{body{background:#fff;}.page{margin:0;max-width:100%;}}
</style></head>
<body><div class="page">
<div class="topRow">
  <div>
    ${data.company.logoUrl ? `<img src="${esc(data.company.logoUrl)}" class="logo" alt="logo"/>` : ""}
    <div class="companyName">${safeStr(data.company.name)}</div>
    <div class="muted">${safeStr(data.company.address1, "")} ${safeStr(data.company.address2, "")}</div>
    <div class="muted">${safeStr(data.company.city, "")}, ${safeStr(data.company.state, "")} · GSTIN ${safeStr(data.company.gstin)}</div>
  </div>
  <div class="invoiceMeta">
    <div class="num">${safeStr(data.invoiceNumber)}</div>
    <div>${fmtDate(data.invoiceDate)}</div>
    <div>${isB2B ? "B2B" : "B2C"} · ${safeStr(data.payment?.status)}</div>
  </div>
</div>
<hr class="divider"/>
<div class="parties">
  <div class="party"><div class="label">Billed To</div>
    ${safeStr(data.customer.name)}<br/>${safeStr(data.customer.address)}<br/>${safeStr(data.customer.city)}, ${safeStr(data.customer.state)} ${safeStr(data.customer.pincode)}
    ${isB2B ? `<br/>GSTIN: ${safeStr(data.customer.gstin)}` : ""}
  </div>
  <div class="party"><div class="label">Payment</div>
    ${safeStr(data.payment?.method)}<br/>Ref: ${safeStr(data.payment?.transactionId)}
  </div>
</div>
<table>
<thead><tr><th>#</th><th>Item</th><th>Qty</th><th>Rate</th><th>GST</th><th>Amount</th></tr></thead>
<tbody>${itemsRows}</tbody>
</table>
<div class="totalsBox">
  <div>Subtotal <span style="float:right;">₹${t.subtotal}</span></div>
  <div>Discount <span style="float:right;">-₹${t.discount}</span></div>
  <div>CGST + SGST + IGST <span style="float:right;">₹${fmtMoney(Number(t.cgst) + Number(t.sgst) + Number(t.igst))}</span></div>
  <div class="grand">Total <span style="float:right;">₹${t.grandTotal}</span></div>
</div>
${signatureHtml}
<div class="footerNote">${safeStr(data.templateConfig?.footerNote, "Thank you for your business.")}</div>
</div></body></html>`;
}

export const minimalLayout: InvoiceLayout = {
  key: "minimal",
  label: "Minimal",
  description: "A compact single-column layout with a slim item table — cleaner and shorter than Classic GST, still shows the full tax breakdown in the totals box.",
  renderHTML: render,
};
