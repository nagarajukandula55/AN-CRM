"use client";

import SalesDocumentManager from "@/components/admin/SalesDocumentManager";

export default function VendorProformaInvoicesPage() {
  return <SalesDocumentManager docType="PROFORMA_INVOICE" label="Proforma Invoice" pluralLabel="Proforma Invoices" />;
}
