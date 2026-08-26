import ScBrandsAndModelsPage from '@/app/console/sc/masters/brands/_BrandsAndModels'

// Same Brands/Models list the shared jobsheet form's quick-add already
// writes to -- vendor-scoped via /api/vendor/saved-catalog instead of
// /api/businesses/[id].
export default function VendorBrandsPage() {
  return <ScBrandsAndModelsPage useVendorScope />
}
