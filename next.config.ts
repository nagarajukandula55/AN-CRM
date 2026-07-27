import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These root-level pages predate the /admin/* rebuild and are kept only
  // as redirects (not deleted) in case anything still links to the old
  // paths. The live, maintained versions all live under /admin/*.
  async redirects() {
    return [
      { source: "/ai", destination: "/admin/ai", permanent: false },
      { source: "/logistics", destination: "/admin/logistics", permanent: false },
      { source: "/analytics", destination: "/admin/analytics", permanent: false },
      { source: "/settings", destination: "/admin/settings/account", permanent: false },
      { source: "/chat", destination: "/admin/chat", permanent: false },
      { source: "/notifications", destination: "/admin/notifications", permanent: false },
      { source: "/employees", destination: "/admin/employees", permanent: false },
      { source: "/ecommerce", destination: "/admin/orders", permanent: false },
      { source: "/erp/crm", destination: "/admin/crm", permanent: false },
      { source: "/erp/inventory", destination: "/admin/inventory", permanent: false },
      { source: "/erp/purchase", destination: "/admin/purchase", permanent: false },
      { source: "/erp/sales", destination: "/admin/sales", permanent: false },
      { source: "/documents/agreements", destination: "/admin/agreements", permanent: false },
      { source: "/agreements", destination: "/admin/agreements", permanent: false },
    ];
  },
};

export default nextConfig;
