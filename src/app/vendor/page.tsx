import ScDashboard from '@/app/console/sc/dashboard/_Dashboard'

// Vendor Dashboard == CRM Overview -- same shared component the console
// side uses at /console/sc/dashboard (real server-side stats aggregates,
// Today/Week/Month/Year period cards, admin-configurable card set), not
// a separate simpler reimplementation. Per explicit direction ("CRM
// Overview should be the home page for SC category... that should be
// the dashboard not a separate option") and because the previous
// /vendor/crm-based version was missing filters/data this one has --
// see _Dashboard.tsx's own comment.
export default function VendorDashboardPage() {
  return <ScDashboard jobsheetsPath="/vendor/crm/jobsheets" homePath="/vendor" />
}
