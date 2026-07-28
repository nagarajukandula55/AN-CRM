"use client";

import SalesDocumentManager from "@/components/admin/SalesDocumentManager";

export default function DebitNotesPage() {
  return <SalesDocumentManager docType="DEBIT_NOTE" label="Debit Note" pluralLabel="Debit Notes" />;
}
