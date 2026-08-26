import SolutionsPage from '@/app/console/sc/masters/solutions/page'

// Same component console/sc/masters/solutions uses -- /api/solutions is
// already vendor-scoped (isolates by vendorId, with a shared-default
// fallback for anything a Super Admin added with no vendorId), no changes
// needed.
export default function VendorSolutionsPage() {
  return <SolutionsPage />
}
