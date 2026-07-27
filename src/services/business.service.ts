import Business from "@/models/Business";

/* ================= DEFAULT MODULE TEMPLATE ================= */
const DEFAULT_MODULES = [
  {
    key: "dashboard",
    label: "Dashboard",
    route: "/dashboard",
    icon: "LayoutDashboard",
    enabled: true,
    accessKeys: ["ADMIN", "VIEW_DASHBOARD"],
  },
  {
    key: "ai",
    label: "AI Workspace",
    route: "/ai",
    icon: "Brain",
    enabled: true,
    accessKeys: ["ADMIN", "AI_ACCESS"],
  },
  {
    key: "logistics",
    label: "Logistics",
    route: "/logistics",
    icon: "Truck",
    enabled: true,
    accessKeys: ["ADMIN", "LOGISTICS_ACCESS"],
  },
  {
    key: "analytics",
    label: "Analytics",
    route: "/analytics",
    icon: "BarChart3",
    enabled: true,
    accessKeys: ["ADMIN", "ANALYTICS_ACCESS"],
  },
  {
    key: "settings",
    label: "Settings",
    route: "/settings",
    icon: "Settings",
    enabled: true,
    accessKeys: ["ADMIN"],
  },
];

/* ================= DEFAULT ACCESS CATALOG ================= */
const DEFAULT_ACCESS = [
  { key: "ADMIN", label: "Admin Access" },
  { key: "VIEW_DASHBOARD", label: "View Dashboard" },
  { key: "AI_ACCESS", label: "AI Workspace Access" },
  { key: "LOGISTICS_ACCESS", label: "Logistics Access" },
  { key: "ANALYTICS_ACCESS", label: "Analytics Access" },
];

/* ================= BUSINESS SERVICE ================= */
export class BusinessService {
  static async createBusiness(payload: any) {
    if (!payload?.name) {
      throw new Error("Business name is required");
    }

    const business = new Business({
      ...payload,

      /* ENFORCED DEFAULTS (DO NOT REMOVE) */
      modules: payload.modules?.length
        ? payload.modules
        : DEFAULT_MODULES,

      accessCatalog: payload.accessCatalog?.length
        ? payload.accessCatalog
        : DEFAULT_ACCESS,

      compliance: {
        taxRegime: "REGULAR",
        filingCycle: "MONTHLY",
        ...payload.compliance,
      },

      financial: {
        currency: "INR",
        fiscalYearStart: "04-01",
        accountingMethod: "ACCRUAL",
        profitTrackingEnabled: true,
        ...payload.financial,
      },

      isActive: true,
      aiEnabled: true,
    });

    return await business.save();
  }

  static async getBusinessById(id: string) {
    return Business.findById(id);
  }

  static async listBusinesses(includeInactive = false) {
    return Business.find(includeInactive ? {} : { isActive: true }).sort({ createdAt: -1 });
  }
}
