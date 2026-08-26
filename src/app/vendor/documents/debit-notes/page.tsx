"use client";

import SalesDocumentManager from "@/components/admin/SalesDocumentManager";

export default function VendorDebitNotesPage() {
  return <SalesDocumentManager docType="DEBIT_NOTE" label="Debit Note" pluralLabel="Debit Notes" />;
}
