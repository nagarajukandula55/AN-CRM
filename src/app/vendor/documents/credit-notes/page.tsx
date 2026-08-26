"use client";

import SalesDocumentManager from "@/components/admin/SalesDocumentManager";

export default function VendorCreditNotesPage() {
  return <SalesDocumentManager docType="CREDIT_NOTE" label="Credit Note" pluralLabel="Credit Notes" />;
}
