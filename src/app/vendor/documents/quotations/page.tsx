"use client";

// Same shared component console/common/documents/quotations uses --
// SalesDocumentManager has no console-only hardcoding at all (just
// businessId-scoped API calls, already correctly vendor-scoped via
// resolveAuthorizedVendorScope in api/sales-documents/route.ts), so no
// parameterization was needed to reuse it here directly.
import SalesDocumentManager from "@/components/admin/SalesDocumentManager";

export default function VendorQuotationsPage() {
  return <SalesDocumentManager docType="QUOTATION" label="Quotation" pluralLabel="Quotations" />;
}
