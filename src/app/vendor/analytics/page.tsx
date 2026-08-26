import AnalyticsPage from '@/app/console/common/analytics/_Analytics'

// Same component console/common/analytics uses -- /api/analytics/overview
// and /api/analytics/trend are already vendorId-scoped
// (resolveAuthorizedVendorScope), no backend changes needed.
export default function VendorAnalyticsPage() {
  return <AnalyticsPage salesPath="/vendor/documents/sales-invoices" jobsheetsPath="/vendor/crm/jobsheets" />
}
