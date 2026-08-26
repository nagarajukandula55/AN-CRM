import JobSheetsListPage from '@/app/console/sc/jobsheets/_JobSheetsList'

// Same shared list component console/sc/jobsheets uses (real KPI cards,
// export, admin-configurable columns) -- previously a separate, thinner
// implementation. /api/crm/jobsheets is already vendor-scoped.
export default function VendorJobSheetsListPage() {
  return <JobSheetsListPage basePath="/vendor/crm/jobsheets" />
}
