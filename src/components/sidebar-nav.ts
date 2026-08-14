// Nav structure ONLY — no "use client" directive, deliberately. This data
// is imported by the server-side /api/ui/sidebar route as well as the
// client Sidebar component; when it lived inside sidebar.tsx (a client
// module), the RSC bundler handed the API route a client-reference proxy
// instead of the real array, so STATIC_MODULES.filter() threw at runtime
// and every sidebar load 500'd in production.
//
// REORGANIZED (folder-and-nav both) into the same buckets pages now
// physically live under: console/sc, console/common, console/admin.
// `modes` below is what actually gates visibility per vendor type (see
// /api/ui/sidebar/route.ts and getVendorAvailableModules) — the folder a
// page's file lives in mirrors this so the two can never quietly drift
// apart the way the old flat console/* tree did. Access to a
// `modes`-restricted item is also bounded by the vendor's paid
// subscription modules (VendorSubscription.modules), not just their
// type — see getVendorAvailableModules in core/access/vendorAccess.service.ts.
//
// BRAND and POS vendor types (and their console/brand, console/pos
// pages) were removed -- this is now an SC-only platform. "SC" is kept
// as a literal union (rather than collapsing to a plain boolean) so a
// legacy BRAND/POS business record already in the database still
// type-checks against `modes` without crashing; it just never matches
// any nav item since nothing is tagged BRAND/POS anymore.
export type OperatingModeKey = "SC";

export interface NavItem {
  key: string; label: string; route: string; icon: string; modes?: OperatingModeKey[];
}
export interface NavSubGroup {
  key: string; label: string; items: NavItem[];
}
export interface NavGroup {
  label: string;
  items?: NavItem[];
  subgroups?: NavSubGroup[];
}

export const NAV_GROUPS: NavGroup[] = [
  { label: "Overview", items: [
    // Type-aware router (console/page.tsx) — sends each user to their own
    // dashboard (sc/dashboard, pos/dashboard, brand/dashboard, or
    // admin/dashboard for staff). Keeping the nav entry's route as plain
    // "/console" (not one of the type dashboards directly) means this one
    // link works correctly no matter which type is logged in.
    { key: "dashboard",  label: "Dashboard",    route: "/console",            icon: "LayoutDashboard" },
  ]},
  { label: "SC", items: [
    // console/sc/dashboard IS SC's CRM overview (stats, recent activity,
    // ageing workorders) -- also reachable via the generic top-level
    // "Dashboard" redirect, but a directly-labeled entry here means an SC
    // user isn't relying on that indirection to find their own overview.
    { key: "sc_dashboard", label: "CRM Overview", route: "/console/sc/dashboard", icon: "LayoutDashboard", modes: ["SC"] },
    // SC is a single-login repair shop: everything is a workorder from
    // intake onward, no separate appointment/lead pipeline at all.
    { key: "sc_jobsheets", label: "Workorders", route: "/console/sc/jobsheets", icon: "ClipboardList", modes: ["SC"] },
    // A plain vendor-editable free-text list (Business.savedBrands/
    // savedModels), NOT the shared hierarchical Brand/Series/Model/
    // Variant catalog Brand vendors use below -- SC's workorder intake
    // screen writes/reads these same two fields directly, so whatever a
    // vendor adds here (or inline from intake) shows up immediately in
    // both places. Solutions is the only OTHER shared-catalog concept SC
    // actually uses (picked at workorder close) -- Fault Codes, Symptom
    // Codes, and Workorder Options are Brand-only, SC's flow never reads
    // them, see the Brand group below.
    { key: "sc-masters-brands",   label: "Brands & Models",       route: "/console/sc/masters/brands",       icon: "Tags",          modes: ["SC"] },
    { key: "sc-masters-solutions", label: "Solutions",            route: "/console/sc/masters/solutions",    icon: "CheckCircle",   modes: ["SC"] },
    { key: "sub-accounts", label: "SC Sub-Accounts", route: "/console/sc/sub-accounts", icon: "Building2", modes: ["SC"] },
  ]},
  { label: "Sales", items: [
    { key: "orders", label: "Orders", route: "/console/common/orders", icon: "ShoppingBag" },
    { key: "sales",  label: "Sales",  route: "/console/common/sales",  icon: "TrendingUp" },
  ]},
  { label: "Materials & Inventory", items: [
    // Access to these two is plan+type gated (Business.modules[] /
    // getAllowedModuleKeysForBusiness), not tied to a single vendor type —
    // they live under console/common on disk since more than one type can
    // be granted them, but which types actually see them is a plan/config
    // decision, not a folder decision.
    { key: "inventory",  label: "Inventory",    route: "/console/common/inventory",  icon: "Package" },
    { key: "warehouses", label: "Warehouses",   route: "/console/common/warehouses", icon: "Building2" },
    // ONE canonical Material/BOM catalog for the whole platform — the old
    // separate "Materials" list/create pages and the "Material Categories"
    // sub-master were duplicate ways to manage the same data and have been
    // removed; this page is the only place materials are now maintained.
    { key: "material-catalog", label: "Material Catalog", route: "/console/common/material-catalog", icon: "Package" },
    { key: "masters-catalog-requests", label: "Catalog Change Requests", route: "/console/common/masters/catalog-requests", icon: "ClipboardCheck" },
    { key: "stock-transfers",   label: "Stock Transfers",   route: "/console/common/stock-transfers",   icon: "ArrowLeftRight" },
    { key: "stock-adjustments", label: "Stock Adjustments", route: "/console/common/stock-adjustments", icon: "SlidersHorizontal" },
  ]},
  { label: "Finance", items: [
    { key: "finance", label: "Finance", route: "/console/common/finance", icon: "DollarSign" },
  ]},
  { label: "Business", items: [
    { key: "customers",  label: "Customer Data", route: "/console/common/customers", icon: "Users" },
    // A vendor's Owner can spin up another full vendor account under
    // itself, paid per-add (see api/vendors/[id]/sub-vendors) -- the
    // page itself gates the actual create action to Owner only, this
    // nav entry is visible to any vendor type since the feature isn't
    // Brand/SC/POS specific.
    { key: "sub-vendors", label: "Sub-Vendors", route: "/console/common/sub-vendors", icon: "Network" },
  ]},
  { label: "Documents", items: [
    { key: "agreements",      label: "Agreements",      route: "/console/common/documents/agreements",       icon: "FileSignature" },
    { key: "quotations",         label: "Quotations",         route: "/console/common/documents/quotations",         icon: "FileText" },
    { key: "delivery-challans",  label: "Delivery Challans",  route: "/console/common/documents/delivery-challans",  icon: "FileText" },
    { key: "credit-notes",       label: "Credit Notes",       route: "/console/common/documents/credit-notes",       icon: "FileText" },
    { key: "debit-notes",        label: "Debit Notes",        route: "/console/common/documents/debit-notes",        icon: "FileText" },
    { key: "proforma-invoices",  label: "Proforma Invoices",  route: "/console/common/documents/proforma-invoices",  icon: "FileText" },
  ]},
  { label: "Reports", items: [
    { key: "reports",   label: "Reports & Downloads", route: "/console/common/reports",   icon: "BarChart3" },
    { key: "report-builder", label: "Report Builder", route: "/console/common/report-builder", icon: "BarChart3" },
    { key: "analytics", label: "Analytics",           route: "/console/common/analytics", icon: "BarChart3" },
  ]},
  { label: "Support", items: [
    // help.angroup.in reads/actions this — kept. The internal Team Chat and
    // in-app Send/Product Feedback pages were removed as not actually
    // required for this business.
    { key: "support_tickets", label: "Support Tickets", route: "/console/common/support-tickets", icon: "LifeBuoy" },
    { key: "contact-messages", label: "Contact Messages", route: "/console/common/contact-messages", icon: "MessageSquare" },
  ]},
  // Only ever visible to a Super Admin / AN Group platform staff — a real
  // tenant (Brand/SC/POS) never sees this group at all, gated on
  // platform-level permission codes no tenant role is ever granted.
  { label: "Admin", subgroups: [
    { key: "adm-users", label: "Users & Access", items: [
      { key: "admin-users",  label: "User Management",      route: "/console/admin/users",  icon: "UserCog" },
      { key: "admin-access", label: "Access Control",       route: "/console/admin/access", icon: "Key" },
      { key: "admin-roles",  label: "Roles & Permissions",  route: "/console/admin/roles",  icon: "Shield" },
      { key: "admin-an-group-staff", label: "Platform Staff", route: "/console/admin/an-group-staff", icon: "Shield" },
    ]},
    { key: "adm-vendors", label: "Vendors", items: [
      { key: "vendors",    label: "Vendors",      route: "/console/admin/vendors",    icon: "Truck" },
      { key: "vendor-subscriptions", label: "Vendor Subscriptions", route: "/console/admin/vendor-subscriptions", icon: "CreditCard" },
      { key: "admin-vendor-billing", label: "Vendor Billing", route: "/console/admin/vendor-billing", icon: "Receipt" },
      { key: "admin-vendor-settlements", label: "Vendor Settlements", route: "/console/admin/vendor-settlements", icon: "Wallet" },
    ]},
    { key: "adm-system", label: "System", items: [
      { key: "admin-plan-features", label: "Plan Features", route: "/console/admin/plan-features", icon: "Sparkles" },
      { key: "admin-page-columns", label: "Page Columns & Cards", route: "/console/admin/page-columns", icon: "SlidersHorizontal" },
      { key: "admin-option-lists", label: "Option Lists", route: "/console/admin/option-lists", icon: "ListChecks" },
      { key: "admin-settings", label: "Settings", route: "/console/admin/settings", icon: "Settings" },
      { key: "admin-plan", label: "Plan & Billing", route: "/console/admin/plan", icon: "Receipt" },
      // Real gate is inside the page itself (session.isSuperAdmin check),
      // same as before.
      { key: "admin-help", label: "Help & System Guide", route: "/console/admin/help", icon: "BookOpen" },
    ]},
    { key: "adm-docs", label: "Documents & Billing", items: [
      { key: "admin-document-templates", label: "Document Templates", route: "/console/admin/document-templates", icon: "FileText" },
      { key: "admin-invoice-templates", label: "Invoice Branding", route: "/console/admin/invoice-templates", icon: "FileText" },
      { key: "admin-gst", label: "GST", route: "/console/admin/gst", icon: "FileText" },
      // Super Admin only.
      { key: "admin-product-feedback", label: "Product Feedback", route: "/console/admin/product-feedback", icon: "MessageSquare" },
      { key: "admin-telegram-users", label: "Telegram Users", route: "/console/admin/telegram-users", icon: "Send" },
      { key: "admin-telegram-log", label: "Telegram Notifications Log", route: "/console/admin/telegram-notifications-log", icon: "Send" },
      { key: "admin-telegram-ids", label: "Telegram Chat IDs", route: "/console/admin/telegram-ids", icon: "Send" },
      { key: "admin-email-templates", label: "Email Templates", route: "/console/admin/email-templates", icon: "Mail" },
    ]},
  ]},
];

export const STATIC_MODULES = NAV_GROUPS.flatMap((g) =>
  g.items ? g.items : (g.subgroups ?? []).flatMap((sg) => sg.items)
);
