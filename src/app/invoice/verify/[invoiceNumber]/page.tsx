"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function VerifyInvoicePage() {
  const { invoiceNumber } = useParams();

  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!invoiceNumber) return;

    fetch(
      `/api/invoice/verify/${invoiceNumber}`
    )
      .then((r) => r.json())
      .then(setData);
  }, [invoiceNumber]);

  if (!data)
    return (
      <div style={{ padding: 30 }}>
        Loading...
      </div>
    );

  if (!data.success)
    return (
      <div style={{ padding: 30 }}>
        Invoice Not Found
      </div>
    );

  return (
    <div
      style={{
        maxWidth: 700,
        margin: "40px auto",
        padding: 30,
        border: "1px solid #ddd",
        borderRadius: 12,
        fontFamily: "Arial",
      }}
    >
      <h1>
        ✅ Invoice Verified
      </h1>

      <hr />

      <p>
        <b>Invoice No:</b>{" "}
        {data.invoiceNumber}
      </p>

      <p>
        <b>Customer:</b>{" "}
        {data.customer?.name}
      </p>

      <p>
        <b>Date:</b>{" "}
        {new Date(
          data.invoiceDate
        ).toLocaleDateString()}
      </p>

      <p>
        <b>Amount:</b> ₹
        {data.summary?.grandTotal}
      </p>

      <p>
        <b>Status:</b> VALID
      </p>

      <p>
        <b>Issued By:</b>
        {" "}
        {data.issuedBy}
      </p>
    </div>
  );
}
