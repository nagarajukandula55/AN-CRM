'use client'

import { useEffect, useState } from "react"
import QRCode from "qrcode"
import type { DocumentRenderData } from "./renderData"

/**
 * The default Invoice/Estimate print layout -- replaces the generic
 * block-driven DocumentRenderer output for these two document types
 * specifically (Service Record/Workorder/Purchase Order/Stock Transfer
 * etc. are unaffected, still rendered via the customizable block system).
 * Adapted from a reference invoice page built for this app's ecommerce/
 * storefront side (Order-model pipeline, api/invoice/view/[invoiceNumber])
 * -- same visual structure (company/party header, invoice meta box, HSN
 * summary, per-line CGST/SGST/IGST columns, QR code, signature,
 * declaration) but wired to THIS app's own DocumentRenderData shape
 * (salesInvoiceToRenderData / jobSheetToRenderData) instead of that
 * separate Order model, so it works for the CRM's real SalesInvoice/
 * CrmJobSheet-Estimate data. All class names prefixed `ric-` to avoid
 * colliding with any other global CSS in the app, since this renders
 * whole sections with plain-looking class names (.table, .box, .header)
 * that would otherwise be too easy to clash with.
 *
 * QR code encodes the CURRENT page URL (re-open/re-print this exact
 * document) rather than a "verify" link -- there's no public verification
 * endpoint for a SalesInvoice in this app, so pointing the QR at one
 * would be a dead link. This is a real, functional use of the QR instead.
 */
export function RichInvoiceLayout({
  data,
  accentColor,
}: {
  data: DocumentRenderData
  accentColor?: string
}) {
  const [qr, setQr] = useState("")
  const accent = accentColor || "#111827"

  useEffect(() => {
    if (typeof window === "undefined") return
    QRCode.toDataURL(window.location.href).then(setQr).catch(() => {})
  }, [])

  const isB2B = !!data.party.gstin
  const hasGstSplit = !!(data.totals.cgst || data.totals.sgst || data.totals.igst)
  const isPlainBill = !isB2B && !hasGstSplit && data.docTypeLabel !== "ESTIMATE"

  // HSN summary -- taxable value grouped by HSN code, B2B only (matches
  // the reference's own B2B-only HSN summary block).
  const hsnSummary = Object.values(
    data.items.reduce((acc: Record<string, { hsn: string; taxable: number }>, item) => {
      const key = item.hsnCode || "—"
      const taxable = item.qty * item.unitPrice
      if (!acc[key]) acc[key] = { hsn: key, taxable: 0 }
      acc[key].taxable += taxable
      return acc
    }, {})
  )

  const safe = (v: any) => (v === undefined || v === null || v === "" ? "—" : v)
  const money = (n?: number) => `₹${(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div className="ric-page">
      <style>{RIC_STYLES}</style>

      <div className="ric-invoiceTitle" style={{ color: accent }}>
        {data.docTypeLabel === "ESTIMATE" ? "ESTIMATE" : isPlainBill ? "BILL" : "TAX INVOICE"}
      </div>

      <div className="ric-header">
        <div className="ric-companyCard">
          <div className="ric-companyName">{safe(data.company.name)}</div>
          <div>{safe(data.company.address)}</div>
          {data.company.gstin && <div>GSTIN: {data.company.gstin}</div>}
          {data.company.phone && <div>Phone: {data.company.phone}</div>}
        </div>

        <div className="ric-invoiceBox">
          <div><b>{isPlainBill ? "Bill No:" : data.docTypeLabel === "ESTIMATE" ? "Estimate No:" : "Invoice No:"}</b> {safe(data.docNumber)}</div>
          <div><b>Date:</b> {safe(data.date)}</div>
          {data.status && <div><b>Status:</b> {safe(data.status)}</div>}
          {data.docTypeLabel !== "ESTIMATE" && (
            <div><b>Document Type:</b> {isPlainBill ? "Bill (No Tax)" : isB2B ? "B2B" : "B2C"}</div>
          )}
        </div>
      </div>

      <div className="ric-grid2">
        <div className="ric-box">
          <div className="ric-sectionTitle">BILL TO</div>
          <div>{safe(data.party.name)}</div>
          <div>{safe(data.party.phone)}</div>
          <div>{safe(data.party.address)}</div>
          {isB2B && <div>GSTIN: {safe(data.party.gstin)}</div>}
        </div>
        {data.device && (data.device.brand || data.device.model || data.device.imeiOrSerial) ? (
          <div className="ric-box">
            <div className="ric-sectionTitle">DEVICE</div>
            <div>{[data.device.brand, data.device.model].filter(Boolean).join(" ") || "—"}</div>
            <div>IMEI/Serial: {safe(data.device.imeiOrSerial)}</div>
          </div>
        ) : (
          <div className="ric-box">
            <div className="ric-sectionTitle">PAYMENT</div>
            <div>Status: {safe(data.status)}</div>
            {data.paymentMethod && <div>Mode: {safe(data.paymentMethod)}</div>}
          </div>
        )}
      </div>

      <div className="ric-productHeader">{data.docTypeLabel === "ESTIMATE" ? "ESTIMATED ITEMS" : "PRODUCT / SERVICE DETAILS"}</div>

      <table className="ric-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Description</th>
            <th>HSN</th>
            <th>Qty</th>
            <th>Rate</th>
            {hasGstSplit ? (
              <>
                <th>CGST</th>
                <th>SGST</th>
                <th>IGST</th>
              </>
            ) : (
              <th>Tax%</th>
            )}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td className="ric-descCell">{item.description}</td>
              <td>{safe(item.hsnCode)}</td>
              <td>{item.qty} {item.unit || ""}</td>
              <td>{money(item.unitPrice)}</td>
              {hasGstSplit ? (
                <>
                  <td>{item.cgstRate ? `${item.cgstRate}%` : "—"}</td>
                  <td>{item.sgstRate ? `${item.sgstRate}%` : "—"}</td>
                  <td>{item.igstRate ? `${item.igstRate}%` : "—"}</td>
                </>
              ) : (
                <td>{item.taxRate}%</td>
              )}
              <td>{money(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {isB2B && hsnSummary.length > 0 && (
        <div className="ric-hsnSummary">
          {hsnSummary.map((row) => (
            <span key={row.hsn} className="ric-hsnChip">HSN {row.hsn} — {money(row.taxable)}</span>
          ))}
        </div>
      )}

      <div className="ric-summaryRow">
        <div className="ric-qrBlock">
          {qr && <img src={qr} alt="QR" width={110} height={110} />}
          <p className="ric-qrCaption">Scan to reopen this document</p>
        </div>

        <div className="ric-summary">
          <div><span>Subtotal</span><span>{money(data.totals.subtotal)}</span></div>
          {hasGstSplit ? (
            <>
              {!!data.totals.cgst && <div><span>CGST</span><span>{money(data.totals.cgst)}</span></div>}
              {!!data.totals.sgst && <div><span>SGST</span><span>{money(data.totals.sgst)}</span></div>}
              {!!data.totals.igst && <div><span>IGST</span><span>{money(data.totals.igst)}</span></div>}
            </>
          ) : (
            <div><span>Tax</span><span>{money(data.totals.tax)}</span></div>
          )}
          {!!data.totals.discount && <div><span>Discount</span><span>-{money(data.totals.discount)}</span></div>}
          <div className="ric-grand"><span>Grand Total</span><span>{money(data.totals.grandTotal)}</span></div>
        </div>
      </div>

      {data.notes && (
        <div className="ric-box" style={{ marginTop: 12 }}>
          <p className="ric-sectionTitle">Notes</p>
          <p style={{ whiteSpace: "pre-line" }}>{data.notes}</p>
        </div>
      )}

      {data.company.termsAndConditions && (
        <div className="ric-box" style={{ marginTop: 12 }}>
          <p className="ric-sectionTitle">Terms &amp; Conditions</p>
          <p style={{ whiteSpace: "pre-line" }}>{data.company.termsAndConditions}</p>
        </div>
      )}

      <div className="ric-signatureRow">
        <div className="ric-signatureBox">
          <div className="ric-signatureLine" />
          <div className="ric-signatoryText">Customer Signature</div>
        </div>
        <div className="ric-signatureBox">
          {data.company.signatureUrl ? (
            <img src={data.company.signatureUrl} alt="signature" className="ric-signatureImage" />
          ) : (
            <div className="ric-digitalNotice">Digital document — no physical signature required.</div>
          )}
          <div className="ric-signatoryText">Authorized Signatory</div>
        </div>
      </div>

      <div className="ric-footer">
        {data.footerText || (isPlainBill ? "This is a computer-generated bill." : "This is a computer-generated document.")}
      </div>

      <div className="ric-declaration">
        <b>Declaration</b>
        <p>Certified that the particulars given above are true and correct. This document is generated electronically and does not require a physical signature.</p>
      </div>

      <button onClick={() => window.print()} className="ric-printBtn print:hidden">
        Print / Save as PDF
      </button>
    </div>
  )
}

const RIC_STYLES = `
.ric-page { max-width: 900px; margin: 0 auto; padding: 4px; font-family: Arial, sans-serif; color: #111827; font-size: 11px; }
.ric-invoiceTitle { text-align: center; font-size: 22px; font-weight: 800; margin-bottom: 12px; letter-spacing: 1px; }
.ric-header { display: flex; justify-content: space-between; gap: 12px; border-bottom: 2px solid #111827; padding-bottom: 10px; }
.ric-companyCard { background: #f8fafc; padding: 12px; border-radius: 10px; border: 1px solid #e5e7eb; line-height: 1.5; max-width: 320px; }
.ric-companyName { font-size: 16px; font-weight: 700; margin-bottom: 6px; }
.ric-invoiceBox { border: 1px solid #111827; border-radius: 8px; padding: 10px; min-width: 240px; line-height: 1.6; font-size: 12px; }
.ric-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 10px 0; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb; }
.ric-box { padding: 8px 10px; font-size: 11px; line-height: 1.5; background: #fafafa; border-radius: 8px; }
.ric-sectionTitle { font-size: 11px; font-weight: 700; margin-bottom: 4px; border-bottom: 1px solid #ddd; padding-bottom: 2px; }
.ric-productHeader { margin-top: 8px; padding-top: 6px; border-top: 1px solid #111827; font-size: 13px; font-weight: 700; text-decoration: underline; margin-bottom: 6px; }
.ric-table { width: 100%; border-collapse: collapse; font-size: 10px; }
.ric-table th { background: #111827; color: #fff; padding: 6px; border: 1px solid #111827; }
.ric-table td { border: 1px solid #d1d5db; padding: 5px; text-align: center; }
.ric-descCell { text-align: left !important; padding-left: 8px !important; }
.ric-hsnSummary { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px; font-size: 10px; }
.ric-hsnChip { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 3px 8px; }
.ric-summaryRow { display: flex; justify-content: space-between; gap: 16px; margin-top: 16px; align-items: flex-start; }
.ric-qrBlock { text-align: center; }
.ric-qrCaption { font-size: 9px; color: #6b7280; margin-top: 4px; }
.ric-summary { width: 260px; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; }
.ric-summary > div { display: flex; justify-content: space-between; padding: 2px 0; }
.ric-grand { font-size: 14px; font-weight: 800; border-top: 1px solid #111827; margin-top: 6px; padding-top: 6px !important; }
.ric-signatureRow { display: flex; justify-content: space-between; gap: 20px; margin-top: 26px; }
.ric-signatureBox { width: 45%; text-align: center; }
.ric-signatureImage { height: 55px; object-fit: contain; display: block; margin: 0 auto; }
.ric-signatureLine { height: 55px; border-bottom: 1px solid #111827; }
.ric-digitalNotice { height: 55px; display: flex; align-items: flex-end; justify-content: center; font-size: 10px; color: #555; font-style: italic; padding-bottom: 4px; }
.ric-signatoryText { margin-top: 4px; border-top: 1px solid #111827; padding-top: 3px; font-size: 11px; font-weight: 600; }
.ric-footer { text-align: center; margin-top: 16px; font-size: 11px; }
.ric-declaration { margin-top: 14px; border-top: 1px solid #e5e7eb; padding-top: 10px; font-size: 10px; color: #4b5563; }
.ric-printBtn { margin-top: 20px; padding: 10px 20px; background: #111827; color: #fff; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
@media print {
  .ric-table th { background: #111827 !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`
