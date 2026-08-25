/**
 * Canonical module key -> display label map for vendor billing/plans.
 * Single-vendor-type app today (SC only) -- no per-type scoping here, just
 * one shared list every plan draws its module bundle from. Mirrors the
 * copy in console/admin/vendor-billing/[vendorId]/page.tsx and
 * vendor/billing/page.tsx (left as-is, out of scope for this change) --
 * new vendor-plan code (admin catalog editor + vendor plan picker) reads
 * from here instead of a 4th copy.
 */
export const MODULE_LABELS: Record<string, string> = {
  sales: "Sales", reviews: "Reviews", inventory: "Inventory", products: "Products",
  product_categories: "Product Categories", materials: "Materials", bom: "BOM",
  grn: "Goods Receipts", warehouses: "Warehouses", stock_transfers: "Stock Transfers",
  stock_adjustments: "Stock Adjustments", purchase: "Purchase", vendor_products: "Vendor Products",
  logistics: "Logistics", finance: "Finance", gst: "GST", crm: "CRM",
  crm_jobsheets: "CRM Job Sheets", fault_codes: "Fault Codes", solutions: "Solutions",
  banners: "Banners", blog: "Blog", staff: "Staff", brands: "Brands", device_models: "Device Models",
};

export const MODULE_KEYS = Object.keys(MODULE_LABELS);
