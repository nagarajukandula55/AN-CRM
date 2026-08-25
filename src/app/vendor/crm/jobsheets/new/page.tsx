import SCJobSheetScreen from '@/app/console/sc/jobsheets/_JobSheetForm'

// Renders the SAME shared workorder screen the console side uses
// (console/sc/jobsheets/_JobSheetForm.tsx) instead of a separate,
// drifted implementation -- previously this was a standalone ~300-line
// page that had fallen behind the actively-maintained console version,
// reported live. basePath/dashboardPath route this instance's internal
// navigation to the vendor portal; useVendorScope points its saved-
// Brands/Models/Payment-Collectors/labour-charge reads at the
// vendor-scoped /api/vendor/saved-catalog instead of /api/businesses/[id]
// (which correctly rejects a vendor Owner/Manager -- see that route).
export default function NewVendorJobSheetPage() {
  return <SCJobSheetScreen basePath="/vendor/crm/jobsheets" dashboardPath="/vendor" useVendorScope />
}
