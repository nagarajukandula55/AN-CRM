"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getLayout } from "@/core/invoiceTemplates/registry";
import type { InvoiceRenderData } from "@/core/invoiceTemplates/types";

/**
 * Renders a non-default invoice layout (Minimal / Modern Color-block /
 * any future addition) by calling that layout's pure renderHTML() function
 * client-side and dropping the result into an iframe — same technique the
 * admin template editor's live preview uses. Layouts have no server-only
 * dependencies (just string templating), so this is safe to run in the
 * browser bundle.
 */
function InvoiceLayoutFrame({ data }: { data: any }) {
  const layout = getLayout(data.templateLayoutKey);
  const html = layout.renderHTML(data as InvoiceRenderData);
  return (
    <iframe
      srcDoc={html}
      style={{ width: "100%", height: "100vh", border: "none" }}
      title={`Invoice ${data.invoiceNumber}`}
    />
  );
}

export default function InvoicePage() {
  const { invoiceNumber } = useParams();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const isB2B = data?.type === "B2B";
  // No company name AND no tax on this document -- a plain Bill, not a
  // Tax Invoice. See api/invoice/view/[invoiceNumber]/route.ts's
  // isGstInvoice comment.
  const isPlainBill = !isB2B && data?.isGstInvoice === false;
  const safe = (v: any) => v ?? "N/A";

  useEffect(() => {
    if (!invoiceNumber) return;

    fetch(`/api/invoice/view/${invoiceNumber}`)
      .then((r) => r.json())
      .then((res) => {
        setData(res && res.success !== false ? res : null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [invoiceNumber]);  

  if (loading) {
    return <div style={{ padding: 20 }}>Loading invoice...</div>;
  }
  
  if (!data) {
    return <div>Invoice not found</div>;
  }

  // If this business has chosen a template LAYOUT other than the platform
  // default ("classic-gst" — this page's own original hardcoded JSX/CSS
  // below, kept byte-identical so nothing changes for businesses that
  // never touch Settings > Invoice Templates), render that layout's
  // server-side HTML renderer in an iframe instead of this page's JSX.
  // This keeps the change additive/low-risk: the default path below is
  // completely untouched, and non-default layouts get their own real
  // renderer (core/invoiceTemplates/layouts/*.ts) rather than trying to
  // shoehorn 3 different designs into one JSX tree.
  if (data.templateLayoutKey && data.templateLayoutKey !== "classic-gst") {
    return <InvoiceLayoutFrame data={data} />;
  }

  return (
    <div
      className="page"
      style={{
        background: "#ffffff",
        color: "#000000",
        minHeight: "100vh",
      }}
    >
      <style>{styles}</style>
      

{/* TAX INVOICE / BILL TITLE */}
<div className="invoiceTitle">
  {isPlainBill ? "BILL" : "TAX INVOICE"}
</div>

{/* COMPANY + INVOICE DETAILS */}
<div className="header">

  <div className="companyCard">

    <div className="companyName">
      {safe(data?.company?.name)}
    </div>

    <div>{safe(data?.company?.tagline)}</div>

    <div>{safe(data?.company?.address1)}</div>

    <div>{safe(data?.company?.address2)}</div>

    <div>
      {safe(data?.company?.city)},
      {" "}
      {safe(data?.company?.state)}
    </div>

    <div>
      GSTIN:
      {" "}
      {safe(data?.company?.gstin)}
    </div>

    <div>
      Phone:
      {" "}
      {safe(data?.company?.phone)}
    </div>

  </div>

  <div className="invoiceBox">

    <div>
      <b>{isPlainBill ? "Bill No:" : "Invoice No:"}</b>
      {" "}
      {safe(data?.invoiceNumber)}
    </div>

    <div>
      <b>{isPlainBill ? "Bill Date:" : "Invoice Date:"}</b>
      {" "}
      {new Date(data?.invoiceDate)
        .toLocaleDateString("en-IN")}
    </div>

    {data?.orderDate && (
      <div>
        <b>Order Date:</b>
        {" "}
        {new Date(data.orderDate)
          .toLocaleDateString("en-IN")}
      </div>
    )}

    {data?.orderId && (
      <div>
        <b>Order ID:</b>
        {" "}
        {safe(data?.orderId)}
      </div>
    )}

    <div>
      <b>Document Type:</b>
      {" "}
      {isPlainBill ? "Bill (No Tax)" : isB2B ? "B2B" : "B2C"}
    </div>

  </div>

</div>

{/* BILL TO / PAYMENT -- SHIP TO removed: this is a services (repair
    workorder / retail sale) invoice, not e-commerce with a separate
    delivery address, so a shipping-address box never had anything real
    to show and just repeated the customer's own billing address. */}

<div className="grid2">

  <div className="box">

    <div className="sectionTitle">BILL TO</div>

    <div>{safe(data?.customer?.name)}</div>
    <div>{safe(data?.customer?.phone)}</div>
    <div>{safe(data?.customer?.address)}</div>
    
    <div>City: {safe(data?.customer?.city)}</div>
    <div>State: {safe(data?.customer?.state)}</div>
    
    <div>PIN: {safe(data?.customer?.pincode)}</div>

    {isB2B && (
      <>
        <br />

        <div>
          GSTIN:
          {" "}
          {safe(data?.customer?.gstin)}
        </div>

        <div>
          State Code:
          {" "}
          {safe(data?.customer?.stateCode)}
        </div>
      </>
    )}

  </div>

  <div className="box">

    <div className="sectionTitle">
      PAYMENT
    </div>

    <div><b>Payment Mode:</b> {safe(data?.payment?.method)}</div>
    <div><b>Transaction:</b> {safe(data?.payment?.transactionId || data?.payment?.utr || data?.payment?.razorpayPaymentId || data?.payment?.paymentId)}</div>
  </div>

</div>

{/* PRODUCT TABLE */}

<div className="productHeader">
  PRODUCT DETAILS
</div>

<table className="table">
  <thead>
    <tr>
      <th>#</th>
      <th>Product</th>
      <th>HSN</th>
      <th>Qty</th>
      <th>Rate</th>
      <th>Discount</th>
      <th>Taxable</th>
      <th>GST%</th>
      <th>CGST</th>
      <th>SGST</th>
      <th>IGST</th>
      <th>Total</th>
    </tr>
  </thead>

  <tbody>
    {(data?.items || []).map((i: any, idx: number) => (
      <tr key={idx}>
        <td>{idx + 1}</td>
        <td>{safe(i?.name)}</td>
        <td>{safe(i?.hsn)}</td>
        <td>{safe(i?.qty)}</td>
        <td>₹{safe(i?.rate || i?.price)}</td>
        <td>₹{safe(i?.discount || 0)}</td>
        <td>₹{safe(i?.taxable || i?.taxableValue)}</td>
        <td>{safe(i?.gstPercent)}%</td>
        <td>₹{safe(i?.cgst)}</td>
        <td>₹{safe(i?.sgst)}</td>
        <td>₹{safe(i?.igst)}</td>
        <td>₹{safe(i?.total || i?.lineTotal)}</td>
      </tr>
    ))}

      <tr>
        <td colSpan={6} style={{ textAlign: "center", fontWeight: 700 }}>
          Total
        </td>
      
        <td style={{ textAlign: "center", fontWeight: 700 }}>
          ₹{safe(data?.summary?.taxable)}
        </td>
      
        <td></td>
      
        <td style={{ textAlign: "center" }}>
          ₹{safe(data?.summary?.cgst)}
        </td>
      
        <td style={{ textAlign: "center" }}>
          ₹{safe(data?.summary?.sgst)}
        </td>
      
        <td style={{ textAlign: "center" }}>
          ₹{safe(data?.summary?.igst)}
        </td>
      
        <td style={{ textAlign: "center", fontWeight: 700 }}>
          ₹{safe(data?.summary?.grandTotal)}
        </td>
      </tr>
  </tbody>
</table>
      
<div
  style={{
    marginTop: "6px",
    fontSize: "11px",
    fontWeight: 600,
  }}
>
  Total Items: {data?.items?.length || 0}
</div>
      

{/* HSN Summary TABLE */}
      
{isB2B && (
  <div className="hsnSummary">
    {(data?.hsnSummary || []).map((row: any, index: number) => (
      <div key={index}>
        HSN {row.hsn} - ₹{row.taxable}
      </div>
    ))}
  </div>
)}

{/* GST SUMMARY / TOTALS -- Place of Supply / State Code / Supply Type /
    Reverse Charge removed: those are inter-state-B2B-specific GST
    disclosures (relevant when goods cross state lines between GST-
    registered businesses), not applicable to a walk-in/local repair
    service B2C invoice, and were showing "N/A" / "B2C" / "No" on every
    single invoice with no real information conveyed. The authenticity-
    verification QR (linking to /invoice/verify) was also removed here --
    only the UPI PAYMENT QR further below remains, and only when this
    business has a UPI VPA configured (see templateConfig.paymentQrUrl,
    generated server-side in api/invoice/view/[invoiceNumber]/route.ts). */}

<div className="summaryRow">

  <div className="summary">

    <div>
      Taxable Amount :
      ₹ {safe(data?.summary?.taxable)}
    </div>

    <div>
      Discount :
      ₹ {safe(data?.summary?.discount)}
    </div>

    <div>
      CGST :
      ₹ {safe(data?.summary?.cgst)}
    </div>

    <div>
      SGST :
      ₹ {safe(data?.summary?.sgst)}
    </div>

    <div>
      IGST :
      ₹ {safe(data?.summary?.igst)}
    </div>

    <div className="grand">

      Grand Total :
      ₹ {safe(data?.summary?.grandTotal)}

    </div>

  </div>

</div>

{/* PAYMENT DETAILS -- UPI QR was already computed server-side
    (templateConfig.paymentQrUrl) but never actually rendered anywhere on
    this page; bankDetails is new. Only shown when at least one is
    configured for this business. */}
{(data?.templateConfig?.paymentQrUrl || data?.bankDetails) && (
  <div style={{ marginTop: 16, display: "flex", gap: 24, fontSize: 12 }}>
    {data?.templateConfig?.paymentQrUrl && (
      <div style={{ textAlign: "center" }}>
        <img src={data.templateConfig.paymentQrUrl} alt="Pay via UPI" style={{ width: 100, height: 100 }} />
        <div style={{ marginTop: 4 }}>Scan to Pay (UPI)</div>
      </div>
    )}
    {data?.bankDetails && (
      <div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Bank Details</div>
        {data.bankDetails.accountName && <div>Account Name: {data.bankDetails.accountName}</div>}
        {data.bankDetails.bankName && <div>Bank: {data.bankDetails.bankName}</div>}
        {data.bankDetails.accountNumber && <div>Account No: {data.bankDetails.accountNumber}</div>}
        {data.bankDetails.ifsc && <div>IFSC: {data.bankDetails.ifsc}</div>}
      </div>
    )}
  </div>
)}

{/* SIGNATURE */}

<div className="signatureRow">

  <div className="signatureBox">
    <div className="signatureLine" />
    <div className="signatoryText">Customer Signature</div>
  </div>

  <div className="signatureBox">
    {data?.signatureUrl ? (
      <img
        src={data.signatureUrl}
        alt="signature"
        className="signatureImage"
      />
    ) : (
      <div className="digitalNotice">
        Digital document — no physical signature required.
      </div>
    )}
    <div className="signatoryText">Authorized Signatory (Service Centre)</div>
  </div>

</div>

{/* DECLARATION -- shown above the "thank you" footer note, per explicit
    direction: a legal/disclaimer statement reads as more of a formal
    closing note than the "thank you" pleasantry, so it belongs right
    before the document ends, not sandwiched above it. */}

<div className="declaration">

  <b>Declaration</b>

  <p>

    Certified that the particulars
    given above are true and correct.
    This invoice is generated
    electronically and does not
    require a physical signature.

  </p>

</div>

{/* FOOTER */}

<div className="footer">

  Thank you for your business with {safe(data?.company?.name)}

  <br />

  {isPlainBill ? "This is a computer generated bill." : "This is a computer generated GST invoice."}

</div>
      
      <button onClick={() => window.print()} className="printBtn">
        Print / Download PDF
      </button>
    </div>
  );
}

/* ================= ERP PRINT CSS ================= */

const styles = `
.page {
  max-width: 950px;
  margin: 10px auto;
  padding: 12px;
  font-family: Arial, sans-serif;
  color: #000;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 8px 30px rgba(0,0,0,.08);
  font-size: 11px;
}

.title {
  font-size: 22px;
  font-weight: bold;
  text-decoration: underline;
  margin-bottom: 10px;
}

.header {
  display: flex;
  justify-content: space-between;
  border-bottom: 2px solid #000;
  padding-bottom: 10px;
  gap: 12px;
}

.invoiceBox {
  border: 1px solid #000;
  padding: 10px;
  border-radius: 8px;
  background: #fff;
  color: #000;
  min-width: 260px;
  line-height: 1.35;
  font-size:12px;
}

.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 8px;
  padding-bottom:8px;
  border-bottom:1px solid #000;
}

.box{
  padding:6px 10px;
  font-size:11px;
  line-height:1.4;
}

.main {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 10px;
  margin-top: 15px;
}

.table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
}

.table th {
  background:#111827;
  color:#fff;
  border: 1px solid #000;
  padding: 8px;
  font-size: 10px;
  font-weight: 700;
  text-align: center;
  white-space: nowrap;
}

.table td {
  border: 1px solid #000;
  padding: 6px;
  font-size: 10px;
  text-align: center;
  vertical-align: middle;
}

.table tbody tr:nth-child(even) {
  background: #fafafa;
}

.table tbody tr:hover {
  background: #f3f4f6;
}

.table td:nth-child(2) {
  text-align: left;
  padding-left: 8px;
  width:35%;
}

.table th {
  font-size: 11px;
  padding: 7px;
}

.table td {
  font-size: 10px;
  padding: 5px;
}

.grand {
  font-size: 16px;
  font-weight: bold;
  margin-top: 10px;
}

.productHeader{
  margin-top:12px;
  padding-top:8px;
  border-top:1px solid #000;
  font-size:14px;
  font-weight:700;
  text-decoration:underline;
  margin-bottom:8px;
}

.qrImage{
  width:120px;
  height:120px;
  object-fit:contain;
  display:block;
  margin:auto;
}

.sign {
  margin-top: 20px;
  text-align: right;
}

.footer {
  text-align: center;
  margin-top: 20px;
  font-size: 12px;
}

.printBtn {
  margin-top:25px;
  padding:14px 24px;
  background:#111827;
  color:#fff;
  border:none;
  border-radius:10px;
  font-weight:600;
  cursor:pointer;
}

.invoiceTitle {
  text-align:center;
  font-size:24px;
  font-weight:800;
  color:#111827;
  margin-bottom:12px;
  letter-spacing:1px;
}

.companyCard{
  flex:0.45;
  align-self:flex-start;
  background:#f8fafc;
  padding:14px;
  border-radius:10px;
  border:1px solid #e5e7eb;
  line-height:1.4;
  font-size:11px;
  max-width: 320px;
}

.companyName{
  font-size:18px;
  font-weight:700;
  margin-bottom:10px;
}

.sectionTitle{
  font-size:12px;
  font-weight:700;
  margin-bottom:6px;
  text-decoration:none;
  border-bottom:1px solid #ddd;
  padding-bottom:3px;
}

.productTitle{
  margin-top:10px;
  margin-bottom:10px;
  font-weight:700;
  text-decoration:underline;
}

.summaryRow{
  display:flex;
  justify-content:flex-end;
  margin-top:20px;
}

.hsnSummary{
  margin-top:10px;
  border-top:1px solid #ccc;
  padding-top:10px;
  font-size:11px;
}

.summary{
  width:320px;
  max-width:100%;
  border:1px solid #000;
  border-radius:10px;
  padding:15px;
  line-height:2;
}

.signatureRow{
  display:flex;
  justify-content:space-between;
  gap:20px;
  margin-top:30px;
}

.signatureBox{
  width:45%;
  text-align:center;
}

.signatureImage{
  height:60px;
  object-fit:contain;
  display:block;
  margin:0 auto;
}

.signatureLine{
  height:60px;
  border-bottom:1px solid #000;
}

.digitalNotice{
  height:60px;
  display:flex;
  align-items:flex-end;
  justify-content:center;
  font-size:10px;
  color:#555;
  font-style:italic;
  padding-bottom:4px;
}

.signatoryText{
  margin-top:6px;
  border-top:1px solid #000;
  padding-top:4px;
  font-size:12px;
  font-weight:600;
}

.gstMeta{
  margin-top:10px;
  font-size:11px;
  line-height:1.6;
  border-top:1px solid #ddd;
  padding-top:8px;
}

.gstMeta b{
  display:inline-block;
  min-width:110px;
}

.declaration{
  margin-top:20px;
  border-top:1px solid #ddd;
  padding-top:15px;
  font-size:12px;
}

@media print {

  body {
    background: white !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .page {
    box-shadow: none !important;
    border: none !important;
    margin: 0 !important;
    max-width: 100% !important;
  }

  .printBtn {
    display: none !important;
  }

  .box div {
    margin-bottom: 2px;
  }

  /* IMPORTANT FIX: force table header color */
  .table th {
    background: #111827 !important;
    color: #fff !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

}
`;
