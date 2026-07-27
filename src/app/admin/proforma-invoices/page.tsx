"use client";

import SalesDocumentManager from "@/components/admin/SalesDocumentManager";

export default function ProformaInvoicesPage() {
  return <SalesDocumentManager docType="PROFORMA_INVOICE" label="Proforma Invoice" pluralLabel="Proforma Invoices" />;
}
