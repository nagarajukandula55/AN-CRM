"use client";

import SalesDocumentManager from "@/components/admin/SalesDocumentManager";

export default function QuotationsPage() {
  return <SalesDocumentManager docType="QUOTATION" label="Quotation" pluralLabel="Quotations" />;
}
