import ReportsPage from '@/app/console/common/reports/page'

// Same component console/common/reports uses -- every endpoint it calls
// (crm/jobsheets, sales/invoices, customers, reports/invoices-zip) is
// already vendorId-scoped, no console-only hardcoding to parameterize.
export default function VendorReportsPage() {
  return <ReportsPage />
}
