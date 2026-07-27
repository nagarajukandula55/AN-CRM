// Nav structure ONLY — no "use client" directive, deliberately. This data
// is imported by the server-side /api/ui/sidebar route as well as the
// client Sidebar component; when it lived inside sidebar.tsx (a client
// module), the RSC bundler handed the API route a client-reference proxy
// instead of the real array, so STATIC_MODULES.filter() threw at runtime
// and every sidebar load 500'd in production.

export interface NavItem {
  key: string; label: string; route: string; icon: string;
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
    { key: "dashboard",  label: "Dashboard",    route: "/admin",            icon: "LayoutDashboard" },
  ]},
  { label: "Operations", subgroups: [
    { key: "ops-sales", label: "Sales", items: [
      { key: "orders",   label: "Orders",       route: "/admin/orders",     icon: "ShoppingBag" },
      { key: "sales",    label: "Sales",        route: "/admin/sales",      icon: "TrendingUp" },
      { key: "coupons",  label: "Coupons",      route: "/admin/coupons",    icon: "Hash" },
    ]},
    { key: "ops-inv", label: "Inventory", items: [
      { key: "inventory",  label: "Inventory",    route: "/admin/inventory",  icon: "Package" },
      { key: "products",   label: "Products",     route: "/admin/products",   icon: "Box" },
      { key: "warehouses", label: "Warehouses",   route: "/admin/warehouses", icon: "Building2" },
      { key: "materials",  label: "Materials",    route: "/admin/materials",  icon: "Box" },
      // These 4 pages existed with complete, working CRUD UIs this whole
      // time but had no sidebar entry at all — same class of bug as the
      // Invoice Branding / GST entries documented further below.
      { key: "masters-units",    label: "Units",              route: "/admin/masters/units",              icon: "Ruler" },
      { key: "masters-brands",   label: "Brands & Models",    route: "/admin/masters/brands",              icon: "Tags" },
      { key: "masters-catalog-requests", label: "Catalog Change Requests", route: "/admin/masters/catalog-requests", icon: "ClipboardCheck" },
      { key: "masters-prod-cat", label: "Product Categories", route: "/admin/masters/product-categories",  icon: "Layers" },
      { key: "masters-mat-cat",  label: "Material Categories",route: "/admin/masters/material-categories", icon: "Layers" },
      // Same bug again — these 2 also had complete, working pages with no
      // sidebar entry at all.
      { key: "masters-fault-codes", label: "Fault Codes", route: "/admin/masters/fault-codes", icon: "AlertTriangle" },
      { key: "masters-symptom-codes", label: "Symptom Codes", route: "/admin/masters/symptom-codes", icon: "AlertTriangle" },
      { key: "masters-solutions",   label: "Solutions",   route: "/admin/masters/solutions",   icon: "CheckCircle" },
      { key: "masters-crm-options", label: "CRM Job Sheet Options", route: "/admin/masters/crm-options", icon: "Settings" },
      // Stock movement screens — also fully built, never wired to nav.
      { key: "stock-transfers",   label: "Stock Transfers",   route: "/admin/stock-transfers",   icon: "ArrowLeftRight" },
      { key: "stock-adjustments", label: "Stock Adjustments", route: "/admin/stock-adjustments", icon: "SlidersHorizontal" },
      { key: "inventory-lots",    label: "Inventory Lots",    route: "/admin/inventory/lots",    icon: "Box" },
    ]},
    { key: "ops-purchase", label: "Purchase", items: [
      { key: "purchase",        label: "Purchase",        route: "/admin/purchase",         icon: "ShoppingCart" },
      { key: "purchase-orders", label: "Purchase Orders", route: "/admin/purchase-orders",  icon: "ShoppingCart" },
      // Consolidated onto the canonical GoodsReceipt model -- see
      // services/goodsReceipt.service.ts's top comment for why three
      // separate, none-of-them-wired-up GRN implementations existed
      // before this. Reuses the "grn" permission key, already in
      // moduleHierarchy.ts from an earlier pass.
      { key: "goods-receipts",  label: "Goods Receipts",  route: "/admin/goods-receipts",   icon: "ShoppingCart" },
      // No admin view of NativeProduct (the storefront-facing collection
      // approval actually writes to) existed at all before this -- a stray
      // ₹0 or leftover test listing there had no way to be found/removed
      // short of raw DB access. Read-only list + deactivate/soft-delete.
      { key: "native-products", label: "Storefront Products", route: "/admin/native-products", icon: "ShoppingBag" },
      // Was its own sidebar entry ("Vendor Products") pointing at a dead
      // stub page — consolidated into the single "Products" entry above;
      // the pending-approvals queue is now reached via a button inside that
      // page (super admin only), not a second top-level menu item, per
      // explicit direction to keep exactly one product-related menu entry.
    ]},
    { key: "ops-production", label: "Manufacturing", items: [
      { key: "bom",        label: "Bill of Materials", route: "/admin/bom",        icon: "Box" },
      { key: "production", label: "Production",        route: "/admin/production", icon: "Package" },
    ]},
    { key: "ops-finance", label: "Finance", items: [
      { key: "finance", label: "Finance", route: "/admin/finance", icon: "DollarSign" },
      { key: "vendor-settlements", label: "Vendor Settlements", route: "/admin/vendor-settlements", icon: "DollarSign" },
      { key: "vendor-billing", label: "Vendor Billing", route: "/admin/vendor-billing", icon: "DollarSign" },
    ]},
  ]},
  { label: "Business", items: [
    { key: "businesses", label: "Businesses",   route: "/admin/business",   icon: "Building2" },
    { key: "vendors",    label: "Vendors",      route: "/admin/vendors",    icon: "Truck" },
    { key: "customers",  label: "Customer Data", route: "/admin/customers", icon: "Users" },
  ]},
  { label: "People", subgroups: [
    { key: "ppl-hr", label: "Human Resources", items: [
      { key: "hr",        label: "HR Overview",  route: "/admin/hr",         icon: "UserCheck" },
      { key: "employees", label: "Employees",    route: "/admin/employees",  icon: "Users" },
      { key: "hr-leave",  label: "Leave",        route: "/admin/hr/leave",   icon: "UserCheck" },
      { key: "hr-payroll",label: "Payroll",      route: "/admin/hr/payroll", icon: "DollarSign" },
      // Real working document-vault page (upload/download/expiry tracking
      // for employee docs) — no nav entry existed for it at all.
      { key: "hr-documents", label: "Documents", route: "/admin/hr/documents", icon: "FolderOpen" },
    ]},
    { key: "ppl-crm", label: "CRM", items: [
      { key: "crm", label: "CRM Overview", route: "/admin/crm", icon: "UserPlus" },
      // Gated on the CRM_CALLS.VIEW / CRM_JOBSHEETS.VIEW permission codes
      // auto-generated by syncPermissionsForModule once
      // /api/admin/seed-crm-modules has been run — see that route's top
      // comment. Keys match the ModuleDefinition.key values exactly
      // ("crm_calls", "crm_jobsheets") so isVisible()'s moduleKeys.has()
      // check lines up with what /api/ui/sidebar actually returns.
      { key: "crm_calls",     label: "Appointments", route: "/admin/crm/calls",     icon: "PhoneCall" },
      { key: "crm_jobsheets", label: "Workorders",   route: "/admin/crm/jobsheets", icon: "ClipboardList" },
      // Shows every business's tickets by default (a filter dropdown on
      // the page itself narrows it down) rather than depending on the
      // sidebar's active-business switcher -- per explicit direction,
      // after that switcher was reported as unreliable.
      { key: "support_tickets", label: "Support Tickets", route: "/admin/support-tickets", icon: "LifeBuoy" },
      // Public "Contact Us" page (app/contact/page.tsx) inbox -- gated on
      // the "contact_messages" permission module registered in
      // moduleHierarchy.ts alongside this page/its API route.
      { key: "contact-messages", label: "Contact Messages", route: "/admin/contact-messages", icon: "MessageSquare" },
    ]},
  ]},
  { label: "Documents", items: [
    { key: "agreements",      label: "Agreements",      route: "/admin/agreements",       icon: "FileSignature" },
    // 5 lightweight, party-facing document types with no record/CRUD
    // anywhere in the app until now (see models/SalesDocument.ts) --
    // added alongside their print pages once the underlying feature
    // existed to print.
    { key: "quotations",         label: "Quotations",         route: "/admin/quotations",         icon: "FileText" },
    { key: "delivery-challans",  label: "Delivery Challans",  route: "/admin/delivery-challans",  icon: "FileText" },
    { key: "credit-notes",       label: "Credit Notes",       route: "/admin/credit-notes",       icon: "FileText" },
    { key: "debit-notes",        label: "Debit Notes",        route: "/admin/debit-notes",        icon: "FileText" },
    { key: "proforma-invoices",  label: "Proforma Invoices",  route: "/admin/proforma-invoices",  icon: "FileText" },
  ]},
  { label: "Reports", items: [
    { key: "reports",   label: "Reports & Downloads", route: "/admin/reports",   icon: "BarChart3" },
    // Real page wired to /api/analytics/overview — was an orphaned
    // root-level route (src/app/analytics/page.tsx) with no nav entry at
    // all before being moved under /admin; see that page's top comment.
    { key: "analytics", label: "Analytics",           route: "/admin/analytics", icon: "BarChart3" },
  ]},
  { label: "Growth", items: [
    { key: "social",   label: "Social Media", route: "/admin/social",    icon: "Share2" },
    { key: "ai-image", label: "AI Studio",    route: "/admin/ai-image",  icon: "Sparkles" },
    { key: "design-studio", label: "Design Studio", route: "/admin/design-studio", icon: "Palette" },
    { key: "native",   label: "Native App",   route: "/admin/native",    icon: "MessageSquare" },
    // ANu is no longer a page -- it's the floating AnuWidget (see
    // AdminShell.tsx), reachable from every admin page via the icon at
    // bottom-left, so it doesn't need (and shouldn't have) a nav entry
    // that navigates away from whatever the user was doing.
  ]},
  { label: "Logistics", items: [
    // Real page wired to /api/logistics/overview — was an orphaned
    // root-level route rendering hardcoded numbers before being moved and
    // rewired; see admin/logistics/page.tsx's top comment.
    { key: "logistics", label: "Logistics & Shipping", route: "/admin/logistics", icon: "Truck" },
  ]},
  { label: "Communication", items: [
    { key: "chat", label: "Team Chat", route: "/admin/chat", icon: "MessageSquare" },
    // Notifications is likewise no longer a page -- it's the floating
    // NotificationBell icon (top-right, every admin page), same reasoning
    // as ANu above.
  ]},
  { label: "Admin", subgroups: [
    { key: "adm-users", label: "Users & Access", items: [
      { key: "admin-users",  label: "User Management",      route: "/admin/users",  icon: "UserCog" },
      { key: "admin-access", label: "Access Control",       route: "/admin/access", icon: "Key" },
      { key: "admin-roles",  label: "Roles & Permissions",  route: "/admin/roles",  icon: "Shield" },
      { key: "admin-an-group-staff", label: "AN Group Staff", route: "/admin/an-group-staff", icon: "Shield" },
    ]},
    { key: "adm-config", label: "Configuration", items: [
      { key: "admin-intg", label: "Integrations", route: "/admin/integrations", icon: "Plug" },
      { key: "admin-sso",  label: "SSO / Auth",   route: "/admin/sso",          icon: "Key" },
      { key: "admin-status", label: "System Status", route: "/admin/system-status", icon: "Activity" },
      { key: "admin-modules", label: "Modules", route: "/admin/modules", icon: "Box" },
      { key: "admin-document-templates", label: "Document Templates", route: "/admin/document-templates", icon: "FileText" },
      // Full business-config hub (business profile, document numbering
      // shortcuts, integrations shortcut, account) — built, never wired.
      { key: "admin-settings", label: "Settings", route: "/admin/settings", icon: "Settings" },
      // Admin tool for refreshing the India pincode autofill dataset —
      // built (with a real MongoDB-backed upload flow, since Vercel's
      // filesystem is read-only), never wired to nav.
      { key: "admin-pincode-data", label: "Pincode Data", route: "/admin/pincode-data", icon: "MapPin" },
      // This page has existed with a complete, working CRUD UI + API this
      // whole time — it just never had a sidebar entry pointing to it, so
      // nobody could reach it from the nav (had to know the URL directly).
      { key: "admin-invoice-templates", label: "Invoice Branding", route: "/admin/invoice-templates", icon: "FileText" },
      // Same class of bug as Invoice Branding above — the GST filings/settings
      // page (admin/gst/page.tsx) has existed with a complete UI + API this
      // whole time but never had a sidebar entry, so it was unreachable from nav.
      { key: "admin-gst", label: "GST", route: "/admin/gst", icon: "FileText" },
      // Same class of bug again — a complete, working feedback inbox with
      // no sidebar entry at all, unreachable except by typing the URL.
      { key: "admin-feedback", label: "Feedback", route: "/admin/feedback", icon: "MessageSquare" },
    ]},
  ]},
];

export const STATIC_MODULES = NAV_GROUPS.flatMap((g) =>
  g.items ? g.items : (g.subgroups ?? []).flatMap((sg) => sg.items)
);
