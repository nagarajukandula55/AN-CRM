import NewSalesInvoicePage from '@/app/console/common/sales/new/_NewSalesInvoice'

// Same create form console/common/sales/new uses, wired to /api/vendor/settings
// instead of /api/businesses/[id] for the UPI/Bank/Signature footer tiles --
// a vendor Owner can't read the shared platform Business record directly.
export default function VendorNewSalesInvoicePage() {
  return <NewSalesInvoicePage listPath="/vendor/documents/sales-invoices" useVendorScope />
}
