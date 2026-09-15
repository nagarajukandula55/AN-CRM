import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These root-level pages predate the /admin/* rebuild and are kept only
  // as redirects (not deleted) in case anything still links to the old
  // paths. The live, maintained versions all live under /admin/*.
  async redirects() {
    return [
      // AN-CRM's public acquisition/auth surface (home, sign in, sign up,
      // pricing) now points to My Biz Flow -- the live product going
      // forward, per explicit direction. /signup, /register, and
      // /vendor-apply already redirect internally to /partner-signup (see
      // those files' own history), so redirecting /partner-signup itself
      // covers all of them without editing each one separately.
      // Deliberately NOT redirected: /console, /vendor, and every other
      // operational route -- vendors not yet migrated to My Biz Flow still
      // run their real business through this app, and redirecting those
      // away would lock them out entirely. permanent:false (not a 301) so
      // this can still be adjusted without a client/CDN caching it forever.
      { source: "/", destination: "https://mybizflow.in", permanent: false },
      { source: "/login", destination: "https://mybizflow.in/login", permanent: false },
      { source: "/partner-signup", destination: "https://mybizflow.in/signup", permanent: false },
      { source: "/pricing", destination: "https://mybizflow.in/pricing", permanent: false },
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
