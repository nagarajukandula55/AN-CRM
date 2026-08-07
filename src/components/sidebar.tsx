"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronRight, ChevronLeft, Menu, X, LayoutDashboard, Package, ShoppingCart,
  TrendingUp, DollarSign, Users, UserCheck, FileSignature, Share2,
  Sparkles, Plug, Shield, Bell, MessageSquare, Building2, UserCog,
  Key, UserPlus, ChevronDown, Check, LogOut, ShoppingBag,
  Box, Hash, Truck, Activity, FileText, PhoneCall, ClipboardList,
  BarChart3, Ruler, Tags, Layers, Bot, MapPin, FolderOpen, Settings,
  ArrowLeftRight, SlidersHorizontal, ShieldCheck, Smartphone, LifeBuoy, Receipt, Plus,
} from "lucide-react";
import { useToast } from "@/components/shared/Toast";
import { getAuthMe, invalidateAuthMeCache } from "@/lib/authMeCache";

const SIDEBAR_COLLAPSED_KEY = "an_sidebar_collapsed";
// Every full page refresh re-fetched /api/auth/me + /api/ui/sidebar from a
// deliberately-empty starting state (see the comment on `modules` below for
// why it starts empty rather than falling back to STATIC_MODULES) -- which
// is what actually produced the "sidebar reloads/flashes every refresh"
// complaint: it wasn't remounting on navigation (Next persists this layout
// across client-side route changes), it was genuinely re-rendering from
// blank on every hard reload. Snapshotting the last successful render here
// lets the very next mount paint immediately from cache while the real
// fetch below still runs in the background and overwrites it the moment it
// resolves -- so a stale/wrong cache can never persist beyond one refresh,
// but a normal refresh no longer visibly collapses to empty first.
const SIDEBAR_CACHE_KEY = "an_sidebar_cache_v1";

function readSidebarCache(): { user: UserInfo; businesses: Business[]; activeBiz: Business | null; modules: any[] } | null {
  try {
    const raw = sessionStorage.getItem(SIDEBAR_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeSidebarCache(snapshot: { user: UserInfo | null; businesses: Business[]; activeBiz: Business | null; modules: any[] }) {
  try {
    if (!snapshot.user) return;
    sessionStorage.setItem(SIDEBAR_CACHE_KEY, JSON.stringify(snapshot));
  } catch { /* sessionStorage unavailable -- cache is a pure optimization */ }
}

interface Business { _id: string; name: string; brandName?: string; businessCode?: string; isPlatform?: boolean; operatingMode?: "BRAND" | "SC" | "POS" | "" }
interface UserInfo {
  id: string; name: string; email: string; role: string;
  isSuperAdmin: boolean; activeBusinessId: string | null;
  isPlatformStaff?: boolean;
  moduleOrder?: string[];
}

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  LayoutDashboard, Package, ShoppingCart, TrendingUp, DollarSign,
  Users, UserCheck, FileSignature, Share2, Sparkles,
  Plug, Shield, Bell, MessageSquare, Building2, UserCog,
  Key, UserPlus, ShoppingBag, Box, Hash, Truck, Activity, FileText,
  PhoneCall, ClipboardList, BarChart3, Ruler, Tags, Layers, Bot,
  MapPin, FolderOpen, Settings, ArrowLeftRight, SlidersHorizontal,
  ShieldCheck, Smartphone, LifeBuoy, Receipt,
};

// Nav data moved to sidebar-nav.ts (a plain module) because the server-side
// /api/ui/sidebar route imports STATIC_MODULES too — importing it from this
// "use client" file handed that route a client-reference proxy instead of
// the array in production builds, 500ing every sidebar load. Re-exported
// here so existing client-page imports keep working unchanged.
export { NAV_GROUPS, STATIC_MODULES } from "./sidebar-nav";
import { NAV_GROUPS, STATIC_MODULES, type NavItem } from "./sidebar-nav";

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const toast    = useToast();

  // Was initialized to STATIC_MODULES (the FULL, unfiltered nav list) as a
  // "safe" default -- but that meant any account whose permission fetch
  // hadn't resolved yet, failed, or genuinely came back with a short list
  // fell straight through to seeing EVERY module in the sidebar, since the
  // old fetch handler only ever called setModules() when the response was
  // both successful AND non-empty (see loadSidebarModules below). This is
  // the actual reason every permission fix for a limited-access role
  // "didn't stick": no matter how correctly scoped the API's response was,
  // a slow network, a legitimate zero-module business, or any upstream
  // hiccup silently fell back to showing everything. Starts empty now --
  // nothing shows until the API actually confirms what this account may
  // see, and an empty/failed response means an empty sidebar, not a full one.
  // Must start IDENTICAL to what the server rendered (empty/null) -- SSR
  // always sees `window === undefined`, so reading sessionStorage directly
  // in a useState initializer made the client's very first render disagree
  // with the server-rendered HTML the instant a cache existed, which is
  // exactly what threw React's hydration-mismatch error (#418) in
  // production. The cached snapshot is instead applied from an effect
  // below, AFTER hydration completes, which is the safe way to do a
  // client-only "paint from cache" — it causes one extra post-hydration
  // render, never a mismatch.
  const [modules, setModules]           = useState<any[]>([]);
  const [modulesLoaded, setModulesLoaded] = useState(false);
  const [open, setOpen]                 = useState(false);
  const [collapsed, setCollapsed]       = useState(false);
  // When the sidebar is collapsed to icon-only, hovering over it expands it
  // back temporarily (without flipping the persisted preference) so labels
  // are reachable without a click -- "menu bar also make it collapsable and
  // expand on hover".
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const isCollapsed = collapsed && !hoverExpanded;
  const [user, setUser]                 = useState<UserInfo | null>(null);
  const [businesses, setBusinesses]     = useState<Business[]>([]);
  const [activeBiz, setActiveBiz]       = useState<Business | null>(null);
  const [bizDropdown, setBizDropdown]   = useState(false);
  const [switching, setSwitching]       = useState(false);
  // Tracks which subgroups are open — default all open
  const [openSubgroups, setOpenSubgroups] = useState<Record<string, boolean>>(() => {
    const allOpen: Record<string, boolean> = {};
    NAV_GROUPS.forEach((g) => (g.subgroups ?? []).forEach((sg) => { allOpen[sg.key] = true; }));
    return allOpen;
  });
  // A subgroup collapsed via its header (openSubgroups[key] === false) still
  // reveals its items on hover, without requiring a click to re-open it --
  // "upon hover on main entry sub entries should be visible". Cleared with a
  // short delay on mouse-leave so moving from the header into the revealed
  // items themselves doesn't instantly hide them.
  const [hoveredSubgroup, setHoveredSubgroup] = useState<string | null>(null);
  const subgroupHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function previewSubgroup(key: string) {
    if (subgroupHoverTimer.current) clearTimeout(subgroupHoverTimer.current);
    setHoveredSubgroup(key);
  }
  function unpreviewSubgroup() {
    if (subgroupHoverTimer.current) clearTimeout(subgroupHoverTimer.current);
    subgroupHoverTimer.current = setTimeout(() => setHoveredSubgroup(null), 150);
  }
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Runs after hydration -- safe to read sessionStorage here since this
  // effect never executes during SSR or the hydration pass itself, only
  // once the client has already committed a render matching the server's.
  useEffect(() => {
    const cached = readSidebarCache();
    if (cached) {
      setUser(cached.user);
      setBusinesses(cached.businesses);
      setActiveBiz(cached.activeBiz);
      setModules(cached.modules);
      setModulesLoaded(true);
    }
  }, []);

  useEffect(() => { loadUser(); }, []);

  // Unread-count badge now lives on the floating NotificationBell icon
  // (AdminShell.tsx) instead of this sidebar nav item, since Notifications
  // is no longer a page to navigate to.

  // Restore the desktop collapsed/expanded preference across visits.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    } catch { /* localStorage unavailable — default to expanded */ }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      if (next) setBizDropdown(false);
      return next;
    });
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setBizDropdown(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function loadUser() {
    try {
      const data = await getAuthMe();
      if (data.success) {
        setUser(data.user);
        setBusinesses(data.businesses || []);

        // Unconditional Super Admin bypass -- matches how isSuperAdmin
        // already behaves as an absolute bypass everywhere else in this
        // app (requirePermission, filterModulesByPermission, etc.). The
        // real permission-filtered fetch below still runs and will keep
        // this in sync, but it must never be the ONLY path a Super Admin
        // depends on to see any menu at all -- if that fetch is ever
        // slow, fails, or can't resolve which business to ask about
        // (e.g. AN Group not found in `businesses` yet on a fresh
        // session), a genuine Super Admin must still see the full nav
        // immediately rather than a blank sidebar. Non-super-admin
        // accounts are NOT given this bypass -- they only ever see
        // exactly what the real permission check confirms.
        if (data.user?.isSuperAdmin) {
          setModules(STATIC_MODULES);
        }

        // Super admins / AN Group platform staff land on the real AN Group
        // business (no auto-pick into a random tenant business) unless the
        // JWT already has a real activeBusinessId — a tenant business must
        // never be silently auto-selected out from under them, since that
        // was hiding platform-wide features (Modules, cross-business
        // reports, etc.) behind a business context nobody explicitly chose.
        // Non-super-admin users still default to their first business,
        // since they have no AN Group / platform view to fall back to.
        const found = data.user?.activeBusinessId
          ? data.businesses?.find((b: Business) => b._id === data.user.activeBusinessId) || null
          : (data.user?.isSuperAdmin || data.user?.isPlatformStaff)
            ? data.businesses?.find((b: Business) => b.isPlatform) || null
            : data.businesses?.[0] || null;
        setActiveBiz(found);
        writeSidebarCache({ user: data.user, businesses: data.businesses || [], activeBiz: found, modules });
        if (found?._id) loadSidebarModules(found._id, data.user, data.businesses || [], found);
      }
    } catch { /* static fallback */ }
  }

  async function loadSidebarModules(businessId: string, userForCache?: UserInfo | null, businessesForCache?: Business[], activeBizForCache?: Business | null) {
    try {
      const res  = await fetch("/api/ui/sidebar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId }),
      });
      const data = await res.json();
      // Trust the API's list exactly as returned -- including an empty
      // one. api/ui/sidebar/route.ts already does the real filtering
      // (permission-based, plus explicitly excluding modules the business
      // admin disabled via Business.modules); this used to only call
      // setModules() when the list was non-empty, silently keeping
      // whatever was there before (the full STATIC_MODULES list on first
      // load) for any account with a short or zero-length real list. A
      // limited-access role account is SUPPOSED to see a short list --
      // that must render as a short sidebar, not fall back to everything.
      const resolvedModules = data.success ? (data.modules || []) : [];
      setModules(resolvedModules);
      writeSidebarCache({
        user: userForCache ?? user,
        businesses: businessesForCache ?? businesses,
        activeBiz: activeBizForCache ?? activeBiz,
        modules: resolvedModules,
      });
    } catch {
      setModules([]);
    } finally {
      setModulesLoaded(true);
    }
  }

  async function switchBusiness(biz: Business) {
    if (switching) return;
    // AN Group is a real Business record for DISPLAY/selection purposes
    // (dropdowns, Admin > Access, role scoping), but it must NOT become a
    // real x-active-business-id in the session -- every existing
    // business-scoped list route in this app (Brands, Products, Vendors,
    // etc.) filters strictly by that header, and AN Group's own Business
    // document legitimately has zero brands/products/vendors of its own.
    // Setting it as a real active business made every one of those pages
    // look like all its data had vanished. "AN Group sees everything" is
    // the SAME thing the old cross-business/no-active-business state
    // already meant for Super Admin -- so selecting AN Group clears the
    // active business (exit-business) instead of switching into it as if
    // it were a normal tenant.
    if (biz.isPlatform) {
      if (!user?.activeBusinessId) { setBizDropdown(false); return; }
      setSwitching(true);
      try {
        const res = await fetch("/api/auth/exit-business", { method: "POST" });
        const data = await res.json();
        if (data.success) {
          invalidateAuthMeCache();
          setActiveBiz(biz);
          setUser((prev) => prev ? { ...prev, activeBusinessId: null } : prev);
          setBizDropdown(false);
          router.refresh();
        } else {
          toast.error(data.message || "Failed to switch to platform view");
        }
      } catch {
        toast.error("Failed to connect to server");
      } finally { setSwitching(false); }
      return;
    }

    if (biz._id === user?.activeBusinessId) { setBizDropdown(false); return; }
    setSwitching(true);
    try {
      const res  = await fetch("/api/auth/switch-business", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: biz._id }),
      });
      const data = await res.json();
      if (data.success) {
        invalidateAuthMeCache();
        setActiveBiz(biz);
        setUser((prev) => prev ? { ...prev, activeBusinessId: biz._id } : prev);
        setBizDropdown(false);
        router.refresh();
        loadSidebarModules(biz._id);
      } else {
        toast.error(data.message || "Failed to switch business");
      }
    } catch {
      toast.error("Failed to connect to server");
    } finally { setSwitching(false); }
  }


  async function handleLogout() {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* silent */ }
    invalidateAuthMeCache();
    router.push("/login");
  }

  const moduleKeys = new Set(modules.map((m: any) => m.key));

  // Per-role custom nav ordering (admin/access page's "Sidebar Order"
  // editor, via Role.moduleOrder) -- items whose key appears in the list
  // are moved to the front in that order (e.g. CRM Overview before
  // Appointments/Workorders); anything not listed keeps its original
  // relative position after them. Scoped to within each group/subgroup's
  // own item list, not a full nav restructure.
  const roleOrder: string[] = user?.moduleOrder || [];
  function applyModuleOrder<T extends { key: string }>(items: T[]): T[] {
    if (!roleOrder.length) return items;
    const ranked: T[] = [];
    const rest: T[] = [];
    for (const item of items) {
      if (roleOrder.includes(item.key)) ranked.push(item); else rest.push(item);
    }
    ranked.sort((a, b) => roleOrder.indexOf(a.key) - roleOrder.indexOf(b.key));
    return [...ranked, ...rest];
  }

  // "Modules" (the module-DEFINITION editor) is a platform-level admin
  // capability, not a per-business seeded module in the ui/sidebar sense —
  // gating it behind moduleKeys would hide it until someone separately
  // seeds an "admin-modules" entry there. Always show it for super admins
  // instead, the same way the business-exit banner bypasses normal gating.
  const isVisible = (key: string) =>
    moduleKeys.has(key) ||
    (key === "admin-modules" && user?.isSuperAdmin) ||
    // Document Templates / Invoice Branding / GST are core platform
    // config, not per-business toggleable modules — but these three used
    // to be shown unconditionally to EVERY logged-in user regardless of
    // role or permissions (a real over-exposure bug: a plain customer or
    // employee account saw GST filing / invoice branding / document
    // templates in their sidebar with no permission check at all). Now
    // gated the same way "admin-modules" already correctly was, to
    // super admins only, until these get proper per-business permission
    // codes like every other module.
    (key === "admin-document-templates" && user?.isSuperAdmin) ||
    (key === "admin-invoice-templates" && user?.isSuperAdmin) ||
    (key === "admin-gst" && user?.isSuperAdmin) ||
    (key === "admin-an-group-staff" && user?.isSuperAdmin) ||
    (key === "admin-feedback" && user?.isSuperAdmin) ||
    (key === "masters-crm-options" && user?.isSuperAdmin);

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed left-4 top-4 z-50 rounded-control border border-border bg-surface p-2.5 shadow-card lg:hidden"
      >
        {open ? <X size={18} className="text-ink-2" /> : <Menu size={18} className="text-ink-2" />}
      </button>

      {open && (
        <div onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden" />
      )}

      <aside
        onMouseEnter={() => collapsed && setHoverExpanded(true)}
        onMouseLeave={() => setHoverExpanded(false)}
        className={`fixed lg:sticky lg:top-0 z-50 h-screen w-60 shrink-0 flex flex-col relative
          border-r border-border bg-surface transform transition-all duration-300
          ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          ${isCollapsed ? "lg:w-16" : "lg:w-60"}
          ${hoverExpanded ? "lg:shadow-card-lg" : ""}`}
      >
        {/* Desktop collapse/expand toggle */}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden lg:flex absolute -right-3 top-6 z-10 h-6 w-6 items-center justify-center rounded-full border border-border bg-surface text-ink-3 shadow-card hover:text-ink hover:bg-surface-2"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>

        {/* Brand -- a real mark (gradient monogram tile) instead of a bare
            wordmark + status dot, so the console reads as its own product
            rather than a generic admin-dashboard template. */}
        <div className="px-5 pt-5 pb-4 border-b border-border">
          {isCollapsed ? (
            <div className="flex justify-center">
              <div
                title="My Biz Flow"
                className="h-8 w-8 rounded-control flex items-center justify-center text-[11px] font-bold text-accent-fg"
                style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-hover))" }}
              >
                AN
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div
                className="h-9 w-9 shrink-0 rounded-control flex items-center justify-center text-xs font-bold text-accent-fg"
                style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-hover))" }}
              >
                AN
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold tracking-tight text-ink leading-tight">My Biz Flow</h2>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse shrink-0" />
                  <p className="text-[10px] text-ink-3 truncate">
                    {user?.isSuperAdmin ? <span className="text-accent font-medium">Super Admin</span> : (user?.role || "Operational")}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Business Switcher */}
        {businesses.length > 0 && (
          <div className="px-3 pt-3 pb-1 relative" ref={dropdownRef}>
            <button
              onClick={() => setBizDropdown(!bizDropdown)}
              disabled={switching}
              title={activeBiz ? (activeBiz.isPlatform ? "AN-CRM (Platform)" : (activeBiz.brandName || activeBiz.name)) : "Select Business"}
              className={`flex w-full items-center rounded-control border border-border bg-surface-2 py-2 text-left transition hover:bg-surface-3 disabled:opacity-60 ${
                isCollapsed ? "justify-center px-0" : "justify-between px-3"
              }`}
            >
              <div className={`flex items-center gap-2 min-w-0 ${isCollapsed ? "" : ""}`}>
                <Building2 size={12} className="shrink-0 text-ink-3" />
                {!isCollapsed && (
                  <span className="truncate text-xs font-medium text-ink-2">
                    {activeBiz ? (activeBiz.isPlatform ? "AN-CRM (Platform)" : (activeBiz.brandName || activeBiz.name)) : "Select Business"}
                  </span>
                )}
              </div>
              {!isCollapsed && (
                <ChevronDown size={12} className={`shrink-0 text-ink-3 transition-transform ${bizDropdown ? "rotate-180" : ""}`} />
              )}
            </button>

            {bizDropdown && (
              <div className={`absolute top-full mt-1 z-50 rounded-card border border-border bg-surface shadow-card-lg overflow-hidden ${
                isCollapsed ? "left-3 w-56" : "left-3 right-3"
              }`}>
                {/* AN Group (the platform owner itself) is a real Business
                    record now (see anGroupBusiness.service.ts) so it's a
                    real, selectable entry in this same list -- but
                    selecting it clears the active business rather than
                    scoping into it as a real tenant (see switchBusiness's
                    isPlatform branch), since AN Group means "see across
                    every business", the same thing "no active business"
                    already meant for Super Admin everywhere else in the
                    app. Visible to every Super Admin / AN Group
                    platform-staff account since api/auth/me's isPlatformStaff
                    branch always includes it. */}
                {[...businesses].sort((a, b) => (b.isPlatform ? 1 : 0) - (a.isPlatform ? 1 : 0)).map((biz) => {
                  const isActive = biz.isPlatform ? !user?.activeBusinessId : biz._id === user?.activeBusinessId;
                  return (
                    <button
                      key={biz._id}
                      onClick={() => switchBusiness(biz)}
                      className={`flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-surface-2 border-b border-border last:border-0 ${biz.isPlatform ? "bg-surface-2" : ""}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {biz.isPlatform && <LogOut size={12} className="shrink-0 text-ink-3" />}
                        <div className="min-w-0">
                          <p className="truncate text-xs text-ink font-medium">{biz.isPlatform ? "AN-CRM (Platform)" : (biz.brandName || biz.name)}</p>
                          {!biz.isPlatform && biz.businessCode && <p className="text-[10px] text-ink-3">{biz.businessCode}</p>}
                        </div>
                      </div>
                      {isActive && <Check size={11} className="shrink-0 text-success ml-2" />}
                    </button>
                  );
                })}
                {/* Right in the same dropdown that already lists this login's
                    SC businesses -- an SC account has no Owner/Manager staff
                    hierarchy, so "add another SC" belongs at the account-
                    switcher level, not buried in Settings. Only shown when
                    the CURRENTLY ACTIVE business is itself SC (matches the
                    dropdown's own scope), per explicit direction ("drop
                    down of SC name which is currently there to match active
                    business ther only give option to add sub vendor"). */}
                {activeBiz?.operatingMode === "SC" && (
                  <button
                    onClick={() => { setBizDropdown(false); router.push("/console/sc/sub-accounts"); }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-2 border-t border-border text-accent"
                  >
                    <Plus size={12} className="shrink-0" />
                    <span className="text-xs font-medium">Add SC Account</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Persistent "currently viewing" banner — visible even when the
            dropdown is closed, so a super admin/AN Group staff member
            never loses track of the fact they're scoped into one tenant
            business and forgets there's a way back to AN Group. Hidden
            when AN Group itself is the active business, since that IS the
            "way out" state. */}
        {!isCollapsed && (user?.isSuperAdmin || user?.isPlatformStaff) && activeBiz && !activeBiz.isPlatform && (
          <div className="mx-3 mb-2 flex items-center justify-between gap-2 rounded-control border border-warning/20 bg-warning-soft px-2.5 py-1.5">
            <span className="truncate text-[10px] text-warning">
              Viewing as: <strong>{activeBiz.brandName || activeBiz.name}</strong>
            </span>
            <button
              onClick={() => {
                const anGroup = businesses.find((b) => b.isPlatform);
                if (anGroup) switchBusiness(anGroup);
              }}
              disabled={switching}
              title="Return to platform view"
              className="shrink-0 text-[10px] font-medium text-warning underline hover:opacity-70 disabled:opacity-60"
            >
              Exit
            </button>
          </div>
        )}

        {/* Nav */}
        {/* overscroll-contain -- see AdminShell.tsx's identical comment.
            Without it, scrolling the nav to its end and continuing to
            scroll can bleed the wheel event through to the main content
            area behind it, which reads as the page scrolling the wrong
            direction. */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 scrollbar-none overscroll-contain">
          {NAV_GROUPS.map((group) => {
            // Collect all items from this group (flat or nested)
            const allItems: NavItem[] = group.items
              ? group.items
              : (group.subgroups ?? []).flatMap((sg) => sg.items);
            // item.modes restricts a nav entry to specific operating modes
            // (see sidebar-nav.ts) -- e.g. Workorders/Fault Codes make no
            // sense for POS. No operatingMode set on the business yet (""
            // or undefined) shows everything, so nothing regresses for
            // businesses that predate this field.
            const modeAllows = (item: NavItem) =>
              !item.modes || !activeBiz?.operatingMode || item.modes.includes(activeBiz.operatingMode);
            const hasVisible = allItems.some((item) => isVisible(item.key) && modeAllows(item));
            if (!hasVisible) return null;

            // Helper: render a single nav link
            const renderItem = (item: NavItem, indent = false) => {
              const dbMod    = modules.find((m: any) => m.key === item.key);
              const m        = { ...item, ...(dbMod || {}) };
              const active   =
                m.route === "/console"
                  ? pathname === "/console"
                  : pathname === m.route ||
                    (m.route.length > 1 && pathname?.startsWith(m.route + "/"));
              const IconComp = ICON_MAP[m.icon] || Building2;
              return (
                <Link
                  key={m.key}
                  href={m.route}
                  onClick={() => setOpen(false)}
                  title={isCollapsed ? m.label : undefined}
                  className={`group flex items-center gap-2.5 rounded-control py-2 transition-all duration-150 ${
                    isCollapsed ? "justify-center px-0" : indent ? "pl-5 pr-3" : "px-3"
                  } ${
                    active
                      ? "bg-accent text-accent-fg"
                      : "text-ink-2 hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  <IconComp
                    size={14}
                    className={active ? "text-accent-fg" : "text-ink-3 group-hover:text-ink-2"}
                  />
                  {!isCollapsed && <span className="text-[13px] font-medium">{m.label}</span>}
                  {!isCollapsed && active && <ChevronRight size={12} className="ml-auto text-ink-3" />}
                </Link>
              );
            };

            // SC is a single-login shop with no separate admin/staff
            // hierarchy at all -- everything under this group for an SC
            // account is just that one person's own account settings
            // (Settings, Integrations, Plan & Billing), never actual
            // platform/user administration. Labelling it "Admin" read as
            // if it belonged to a role SC doesn't have, per explicit
            // direction ("admin is not there in SC, only single login").
            // Cosmetic-only relabel; the underlying permission/visibility
            // gating is unchanged.
            const displayLabel = group.label === "Admin" && activeBiz?.operatingMode === "SC" ? "Account" : group.label;

            return (
              <div key={group.label} className="mb-4">
                {/* Section header */}
                {!isCollapsed && (
                  <p className="px-3 mb-1 text-[9px] uppercase tracking-[0.45em] text-ink-3 font-semibold">
                    {displayLabel}
                  </p>
                )}

                {/* Flat items */}
                {group.items && (
                  <div className="space-y-0.5">
                    {applyModuleOrder(group.items.filter((item) => isVisible(item.key) && modeAllows(item)))
                      .map((item) => renderItem(item))}
                  </div>
                )}

                {/* Nested sub-groups */}
                {group.subgroups && (
                  // Collapsed mode hides every subgroup's text header (below),
                  // so a 0.5-unit gap left different subgroups' icon columns
                  // visually blending into one undifferentiated stack with no
                  // way to tell where "Sales" ends and "Inventory" begins.
                  // Collapsed mode gets real spacing instead; expanded mode
                  // keeps the tight spacing since the headers already do the
                  // separating there.
                  <div className={isCollapsed ? "space-y-2.5" : "space-y-0.5"}>
                    {group.subgroups.map((sg, sgIndex) => {
                      const visibleSgItems = applyModuleOrder(sg.items.filter((i) => isVisible(i.key) && modeAllows(i)));
                      if (visibleSgItems.length === 0) return null;
                      const sgOpen = openSubgroups[sg.key] !== false;

                      // A closed subgroup previews its items on hover without
                      // needing a click -- the header's own hover state isn't
                      // enough since moving the mouse down into the revealed
                      // items would otherwise count as "left the header."
                      // Covering the header + revealed items in one
                      // mouse-tracking region fixes that.
                      const previewing = hoveredSubgroup === sg.key;

                      return (
                        <div
                          key={sg.key}
                          onMouseEnter={() => previewSubgroup(sg.key)}
                          onMouseLeave={unpreviewSubgroup}
                        >
                          {/* Sub-group toggle header */}
                          {!isCollapsed && (
                            <button
                              onClick={() =>
                                setOpenSubgroups((p) => ({ ...p, [sg.key]: !sgOpen }))
                              }
                              className="flex w-full items-center justify-between rounded-control px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-3 hover:bg-surface-2 hover:text-ink-2 transition-all"
                            >
                              <span>{sg.label === "System" && activeBiz?.operatingMode === "SC" ? "General" : sg.label}</span>
                              <ChevronDown
                                size={10}
                                className={`transition-transform ${sgOpen || previewing ? "" : "-rotate-90"}`}
                              />
                            </button>
                          )}

                          {/* Collapsed mode: a thin divider stands in for the
                              hidden text header, so each subgroup still reads
                              as its own visually distinct block of icons. */}
                          {isCollapsed && sgIndex > 0 && (
                            <div className="mx-3 mb-2.5 border-t border-border" />
                          )}

                          {/* Sub-group items -- open (pinned via click),
                              hovered (temporary preview of a closed
                              subgroup), or the whole sidebar is in icon-only
                              mode (grouping doesn't apply there). */}
                          {(sgOpen || isCollapsed || previewing) && (
                            <div className="space-y-0.5 mt-0.5">
                              {visibleSgItems.map((item) => renderItem(item, !isCollapsed))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Support link -- opens an-helpdesk's public ticket form in a new
            tab, same app every AN Group site links to (see its own README).
            NEXT_PUBLIC_HELPDESK_URL keeps the actual domain out of this
            component so it's one env var to change, not a hardcoded URL. */}
        {process.env.NEXT_PUBLIC_HELPDESK_URL && (
          <div className="px-3 pb-2">
            <a
              href={process.env.NEXT_PUBLIC_HELPDESK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-2 rounded-control px-3 py-2 text-xs text-ink-3 hover:text-ink hover:bg-surface-2 transition ${
                isCollapsed ? "justify-center" : ""
              }`}
              title="Get Support"
            >
              <LifeBuoy size={14} />
              {!isCollapsed && <span>Get Support</span>}
            </a>
          </div>
        )}

        {/* User footer */}
        <div className="px-3 py-3 border-t border-border">
          {user ? (
            <div className={`rounded-control border border-border bg-surface-2 ${isCollapsed ? "p-2" : "p-3"}`}>
              <div className={`flex items-center ${isCollapsed ? "flex-col gap-2" : "justify-between"}`}>
                {!isCollapsed && (
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-ink">{user.name}</p>
                    <p className="text-[10px] text-ink-3 mt-0.5">
                      {user.isSuperAdmin ? "Super Admin" : user.role}
                    </p>
                  </div>
                )}
                <button
                  onClick={handleLogout}
                  className="p-1.5 rounded-control text-ink-3 hover:text-ink hover:bg-surface-3 transition"
                  title="Sign out"
                >
                  <LogOut size={13} />
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-control border border-border bg-surface-2 p-3">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-ink-3 animate-pulse" />
                <span className="text-xs text-ink-3">Loading…</span>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
