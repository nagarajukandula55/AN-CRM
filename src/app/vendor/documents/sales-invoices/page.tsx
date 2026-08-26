import SalesPage from '@/app/console/common/sales/_SalesInvoices'

// Same list component console/common/sales uses -- /api/sales/invoices and
// /api/customers are already vendor-scoped (resolveAuthorizedVendorScope).
// Distinct from /vendor/invoices (the read-only B2B invoices AN Group bills
// the vendor for module fees) -- this is the vendor raising their OWN sales
// invoices to their own end customers, same as console/common/sales.
export default function VendorSalesInvoicesPage() {
  return (
    <SalesPage
      basePath="/vendor/documents/sales-invoices"
      newPath="/vendor/documents/sales-invoices/new"
      estimatePath="/vendor/documents/quotations"
      backPath="/vendor"
    />
  )
}
