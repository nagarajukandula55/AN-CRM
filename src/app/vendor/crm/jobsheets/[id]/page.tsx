import SCJobSheetScreen from '@/app/console/sc/jobsheets/_JobSheetForm'

// Same shared screen as new/page.tsx -- see that file's own comment for
// why. Previously a separate ~1000-line implementation.
export default function VendorJobSheetDetailPage() {
  return <SCJobSheetScreen basePath="/vendor/crm/jobsheets" dashboardPath="/vendor" useVendorScope />
}
