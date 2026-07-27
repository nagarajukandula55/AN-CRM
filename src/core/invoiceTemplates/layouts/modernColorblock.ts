/**
 * "Modern Color-block" layout — a bolder, brand-forward design with a
 * full-width accent-colored header band and colored section labels.
 * Aimed at businesses that want their invoice to visually match their
 * brand color rather than look like a plain compliance document.
 */

import type { InvoiceLayout, InvoiceRenderData } from "../types";
import { esc, fmtMoney, fmtDate, safeStr, totals } from "../helpers";

function render(data: InvoiceRenderData): string {
  const isB2B = data.type === "B2B";
  const accent = esc(data.templateConfig?.accentColor || "#7c3aed");
  const t = totals(data);

  const itemsRows = (data.items || [])
    .map(
      (i, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${safeStr(i.name, "")}</td>
      <td>${safeStr(i.hsn, "-")}</td>
      <td>${safeStr(i.qty, "0")}</td>
      <td>₹${fmtMoney(i.rate)}</td>
      <td>₹${fmtMoney(i.taxable)}</td>
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
body{margin:0;background:#f0f0f3;}
.page{max-width:800px;margin:20px auto;background:#fff;font-family:'Segoe UI',Arial,sans-serif;color:#111827;font-size:12px;overflow:hidden;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.1);}
.band{background:${accent};color:#fff;padding:28px 36px;display:flex;justify-content:space-between;align-items:center;}
.band .logo{max-height:44px;margin-bottom:8px;filter:brightness(0) invert(1);}
.band .companyName{font-size:20px;font-weight:700;}
.band .tagline{font-size:11px;opacity:.85;}
.band .meta{text-align:right;font-size:11px;line-height:1.7;}
.band .meta .num{font-size:18px;font-weight:800;}
.body{padding:28px 36px;}
.parties{display:flex;gap:24px;margin-bottom:22px;}
.party{flex:1;background:#faf9ff;border-left:3px solid ${accent};padding:12px 16px;border-radius:6px;font-size:11px;line-height:1.6;}
.party .label{color:${accent};font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;}
table{width:100%;border-collapse:collapse;margin-top:6px;}
thead th{background:${accent};color:#fff;padding:9px 8px;font-size:10px;text-transform:uppercase;letter-spacing:.03em;text-align:left;}
thead th:nth-child(1),thead th:nth-child(4),thead th:nth-child(5),thead th:nth-child(6),thead th:nth-child(7),thead th:nth-child(8){text-align:center;}
tbody td{padding:9px 8px;border-bottom:1px solid #f0f0f3;font-size:11px;}
tbody td:nth-child(1),tbody td:nth-child(4),tbody td:nth-child(5),tbody td:nth-child(6),tbody td:nth-child(7),tbody td:nth-child(8){text-align:center;}
.totalsBox{margin-left:auto;width:280px;margin-top:18px;background:#faf9ff;border-radius:8px;padding:16px 20px;font-size:11px;line-height:2;}
.totalsBox .grand{font-size:16px;font-weight:800;color:${accent};}
.signature{margin-top:32px;text-align:right;font-size:11px;}
.signature img{height:60px;display:block;margin-left:auto;}
.footerBand{background:#faf9ff;padding:18px 36px;text-align:center;font-size:10px;color:#6b7280;}
@media print{body{background:#fff;}.page{box-shadow:none;border-radius:0;margin:0;max-width:100%;}}
</style></head>
<body><div class="page">
<div class="band">
  <div>
    ${data.company.logoUrl ? `<img src="${esc(data.company.logoUrl)}" class="logo" alt="logo"/>` : ""}
    <div class="companyName">${safeStr(data.company.name)}</div>
    <div class="tagline">${safeStr(data.company.tagline, "")}</div>
  </div>
  <div class="meta">
    <div class="num">${safeStr(data.invoiceNumber)}</div>
    <div>${fmtDate(data.invoiceDate)}</div>
    <div>${isB2B ? "B2B" : "B2C"}</div>
  </div>
</div>
<div class="body">
<div class="parties">
  <div class="party"><div class="label">Bill To</div>
    ${safeStr(data.customer.name)}<br/>${safeStr(data.customer.address)}<br/>${safeStr(data.customer.city)}, ${safeStr(data.customer.state)} ${safeStr(data.customer.pincode)}
    ${isB2B ? `<br/>GSTIN: ${safeStr(data.customer.gstin)}` : ""}
  </div>
  <div class="party"><div class="label">Payment</div>
    ${safeStr(data.payment?.method)}<br/>${safeStr(data.payment?.status)}<br/>Ref: ${safeStr(data.payment?.transactionId)}
  </div>
</div>
<table>
<thead><tr><th>#</th><th>Item</th><th>HSN</th><th>Qty</th><th>Rate</th><th>Taxable</th><th>GST</th><th>Total</th></tr></thead>
<tbody>${itemsRows}</tbody>
</table>
<div class="totalsBox">
  <div>Taxable <span style="float:right;">₹${t.taxable}</span></div>
  <div>CGST <span style="float:right;">₹${t.cgst}</span></div>
  <div>SGST <span style="float:right;">₹${t.sgst}</span></div>
  <div>IGST <span style="float:right;">₹${t.igst}</span></div>
  <div class="grand">Grand Total <span style="float:right;">₹${t.grandTotal}</span></div>
</div>
${signatureHtml}
</div>
<div class="footerBand">${safeStr(data.templateConfig?.footerNote, "This is a computer generated GST invoice.")}</div>
</div></body></html>`;
}

export const modernColorblockLayout: InvoiceLayout = {
  key: "modern-colorblock",
  label: "Modern Color-block",
  description: "A bold, brand-forward design with a full-width colored header band matching your accent color — for businesses that want their invoice to feel like their brand, not just a compliance document.",
  renderHTML: render,
};
