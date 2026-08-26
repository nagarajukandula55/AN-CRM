import InventoryPage from '@/app/console/common/inventory/_Inventory'

// Same component console/common/inventory uses. /api/inventory/items and
// /api/inventory/movements are now vendorId-scoped (previously business-
// wide only, which would have shown every vendor sharing the platform
// Business each other's stock) -- see those routes' own comments.
export default function VendorInventoryPage() {
  return <InventoryPage backPath="/vendor" />
}
