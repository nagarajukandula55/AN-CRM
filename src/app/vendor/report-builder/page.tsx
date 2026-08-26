import ReportBuilderPage from '@/app/console/common/report-builder/page'

// Same component console/common/report-builder uses. /api/reports/
// definitions and /api/reports/definitions/[id]/(run) are now vendorId-
// scoped (a vendor's saved reports are private to them, with a shared-
// default fallback for business-level ones), and runReport() applies each
// data source's own vendor-isolation field when executing a query.
export default function VendorReportBuilderPage() {
  return <ReportBuilderPage />
}
