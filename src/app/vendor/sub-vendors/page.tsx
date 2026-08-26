import SubVendorsPage from '@/app/console/common/sub-vendors/page'

// Same component console/common/sub-vendors uses -- already fully
// vendor-scoped (reads /api/vendor/type-context for the caller's own
// vendorId, posts to /api/vendors/[id]/sub-vendors), no console-only
// hardcoding to parameterize. This is the real UI for the "Sub-vendor /
// multi-center hierarchy" feature Ultimate-tier plans promise -- it had
// no vendor-facing route at all before this.
export default function VendorSubVendorsPage() {
  return <SubVendorsPage />
}
