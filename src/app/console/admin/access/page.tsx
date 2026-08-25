"use client";

import React, { useState, useEffect, useMemo } from "react";
import useSWR from "swr";
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2 } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { ACCESS_HIERARCHY } from "@/core/access/moduleHierarchy";
import { STANDARD_ACTIONS } from "@/core/access/actions";
import { STATIC_MODULES } from "@/components/sidebar";
import { MODULE_KEY_ALIASES } from "@/core/access/moduleKeyAliases";
import { useToast } from "@/components/shared/Toast";

interface Role {
  _id: string;
  name: string;
  code: string;
  roleNumber?: string | null;
  description?: string;
  color?: string;
  isSystem?: boolean;
  isProtected?: boolean;
  permissions: string[];
  businessId?: string | null;
  homeRoute?: string;
  moduleOrder?: string[];
}

interface Business { _id: string; name: string; isPlatform?: boolean }

interface EffModule { key: string; label: string; description?: string; parentKey: string }
interface EffSubcategory { key: string; label: string; isCustom: boolean; modules: EffModule[] }
interface EffCategory { key: string; label: string; isCustom: boolean; subcategories: EffSubcategory[] }

function buildCode(moduleKey: string, actionKey: string): string {
  return `${moduleKey.toUpperCase()}.${actionKey.toUpperCase()}`;
}

// A module's real permission key and the sidebar's UI nav key sometimes
// differ (see moduleKeyAliases.ts) -- resolve either direction to the key
// the sidebar actually renders/matches on, so "Sidebar Order" and the
// business's enabled-modules filter both line up with what the sidebar
// itself checks, instead of silently matching nothing for aliased keys.
function toSidebarKey(moduleKey: string): string {
  if (STATIC_MODULES.some((m) => m.key === moduleKey)) return moduleKey;
  const uiKey = Object.entries(MODULE_KEY_ALIASES).find(([, real]) => real === moduleKey)?.[0];
  return uiKey || moduleKey;
}

export default function AccessPage() {
  const toast = useToast();
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [editRoleModal, setEditRoleModal] = useState<{ name: string; description: string } | null>(null);
  const [renameNodeModal, setRenameNodeModal] = useState<{ key: string; label: string; kind: "category" | "subcategory" } | null>(null);
  const [creating, setCreating] = useState<boolean>(false);
  const [newRoleName, setNewRoleName] = useState<string>("");
  const [newRoleCode, setNewRoleCode] = useState<string>("");
  const [newRoleColor, setNewRoleColor] = useState<string>("#6366f1");
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; role: Role | null }>({
    open: false,
    role: null,
  });
  const [search, setSearch] = useState("");
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
  const [openSubcategories, setOpenSubcategories] = useState<Record<string, boolean>>({});

  // Active-business context: "current active business and its active
  // modules should show there, then Role name and access it should allow
  // me to select" -- picking a business filters the tree down to only the
  // modules that business actually has enabled (same enabled-set logic
  // Business > Modules already uses), and filters the role list to that
  // business's own roles (plus platform-wide roles with no businessId).
  const [activeBusinessId, setActiveBusinessId] = useState<string>("");
  // Keys EXPLICITLY turned off for this business (Business > Modules,
  // enabled: false) -- a module absent from the saved array entirely is
  // NOT the same as disabled; it just means this business's modules[]
  // predates that module key existing at all (true for most modules
  // added this session: assets/customers/designs/employees/solutions/
  // crm/settings/integrations/users/roles/access/gst/...). Treating
  // "absent" as "disabled" (an earlier, stricter version of this filter)
  // hid every module a business had never explicitly re-saved since,
  // which is why Settings/Integrations/User Management/etc. kept
  // vanishing a couple seconds after the page loaded (the initial
  // unrestricted render, then this filter kicking in once the fetch
  // resolved). Every other consumer of Business.modules[] in this
  // codebase already uses the same "enabled unless explicitly false"
  // convention -- this page was the one place that didn't.
  // DB-backed, admin-editable category/subcategory tree (built-in
  // ACCESS_HIERARCHY + any custom containers/re-parenting on top of it --
  // see accessLayout.service.ts).
  const [addingCategory, setAddingCategory] = useState(false);
  const [addingSubFor, setAddingSubFor] = useState<string | null>(null);
  const [newNodeLabel, setNewNodeLabel] = useState("");

  // AN Group is a real, always-present Business record (see
  // anGroupBusiness.service.ts) -- it shows up in `businesses` like any
  // other business, so activeBusinessId is always a real business's id,
  // never a null/empty sentinel. Defaults to AN Group once the list loads.
  const businessParam = activeBusinessId;

  const { data: businessesRaw } = useSWR("/api/businesses/list");
  const businesses: Business[] = businessesRaw?.businesses || businessesRaw?.data || [];
  const anGroupBusinessId = useMemo(() => businesses.find((b) => b.isPlatform)?._id || "", [businesses]);
  useEffect(() => {
    const anGroup = businesses.find((b) => b.isPlatform);
    if (anGroup) setActiveBusinessId((prev) => prev || anGroup._id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessesRaw]);

  // Roles are fetched scoped to the active business (server-side now, not
  // just hidden client-side after an unscoped fetch of EVERY business's
  // roles -- see fetchRoles below) -- so this must wait for a real
  // activeBusinessId before firing, and re-fire on switch.
  const { data: rolesRaw, isLoading: loading, mutate: refetchRoles } = useSWR(
    activeBusinessId ? `/api/admin/roles?businessId=${activeBusinessId}` : null,
    { keepPreviousData: true }
  );
  const roles: Role[] = rolesRaw?.roles || rolesRaw || [];

  useEffect(() => {
    setSelectedRole((prev) => {
      if (!prev) return prev;
      const fresh = roles.find((r: Role) => r._id === prev._id);
      return fresh || prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolesRaw]);

  const { data: hierarchyRaw, isLoading: hierarchyLoading, mutate: refetchHierarchy } = useSWR(
    activeBusinessId ? `/api/admin/access-layout?businessId=${businessParam}` : null,
    { keepPreviousData: true }
  );
  const hierarchy: EffCategory[] = hierarchyRaw?.hierarchy || [];
  useEffect(() => {
    setOpenCategories((prev) => {
      const open = { ...prev };
      hierarchy.forEach((c) => { if (open[c.key] === undefined) open[c.key] = true; });
      return open;
    });
    setOpenSubcategories((prev) => {
      const open = { ...prev };
      hierarchy.forEach((c) => c.subcategories.forEach((sc) => { if (open[sc.key] === undefined) open[sc.key] = true; }));
      return open;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hierarchyRaw]);

  const { data: businessDetailRaw } = useSWR(
    activeBusinessId && activeBusinessId !== anGroupBusinessId ? `/api/businesses/${activeBusinessId}` : null
  );
  const businessDisabledKeys: Set<string> = useMemo(() => {
    if (!activeBusinessId || activeBusinessId === anGroupBusinessId) return new Set<string>();
    const biz = businessDetailRaw?.business || businessDetailRaw;
    const mods = Array.isArray(biz?.modules) ? biz.modules : [];
    // Only keys EXPLICITLY saved as enabled: false are hidden -- a key
    // this business's modules[] has never heard of (most modules, for
    // most businesses -- see the state comment above) stays visible.
    const disabled = mods.filter((m: any) => m?.enabled === false).map((m: any) => String(m?.key));
    return new Set(disabled);
  }, [activeBusinessId, anGroupBusinessId, businessDetailRaw]);

  async function addCategory() {
    if (!newNodeLabel.trim()) return;
    await fetch("/api/admin/access-layout", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "addCategory", label: newNodeLabel.trim(), businessId: businessParam }),
    });
    setNewNodeLabel(""); setAddingCategory(false);
    refetchHierarchy();
  }

  async function addSubcategory(parentKey: string) {
    if (!newNodeLabel.trim()) return;
    await fetch("/api/admin/access-layout", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "addSubcategory", label: newNodeLabel.trim(), parentKey, businessId: businessParam }),
    });
    setNewNodeLabel(""); setAddingSubFor(null);
    refetchHierarchy();
  }

  async function renameNode(key: string, label: string) {
    if (!label.trim()) return;
    await fetch("/api/admin/access-layout", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename", key, label: label.trim(), businessId: businessParam }),
    });
    refetchHierarchy();
  }

  async function deleteNode(key: string) {
    await fetch("/api/admin/access-layout", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", key, businessId: businessParam }),
    });
    refetchHierarchy();
  }

  async function moveModuleTo(moduleKey: string, parentKey: string) {
    await fetch("/api/admin/access-layout", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "moveModule", moduleKey, parentKey, businessId: businessParam }),
    });
    refetchHierarchy();
  }

  const allSubcategories = useMemo(
    () => hierarchy.flatMap((c) => c.subcategories.map((sc) => ({ key: sc.key, label: `${c.label} / ${sc.label}` }))),
    [hierarchy]
  );

  function togglePermission(code: string) {
    if (!selectedRole) return;
    const has = selectedRole.permissions.includes(code);
    const updated = has
      ? selectedRole.permissions.filter((p) => p !== code)
      : [...selectedRole.permissions, code];
    setSelectedRole({ ...selectedRole, permissions: updated });
  }

  /** Grant/revoke every action for a module in one click. */
  function toggleModule(moduleKey: string, grant: boolean) {
    if (!selectedRole) return;
    const moduleCodes = STANDARD_ACTIONS.map((a) => buildCode(moduleKey, a.key));
    const withoutModule = selectedRole.permissions.filter((p) => !moduleCodes.includes(p));
    setSelectedRole({
      ...selectedRole,
      permissions: grant ? [...withoutModule, ...moduleCodes] : withoutModule,
    });
  }

  async function savePermissions() {
    if (!selectedRole) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/roles/${selectedRole._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          permissions: selectedRole.permissions,
          homeRoute: selectedRole.homeRoute || "",
          moduleOrder: selectedRole.moduleOrder || [],
          name: selectedRole.name,
          description: selectedRole.description || "",
          // Required for the server-side business-ownership check now --
          // editing a role always happens in the context of the currently
          // active business.
          businessId: selectedRole.businessId ?? activeBusinessId,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const updated = roles.map((r) =>
        r._id === selectedRole._id ? { ...r, ...selectedRole } : r
      );
      refetchRoles((current: any) => ({ ...(current || {}), roles: updated }), false);
    } catch {
      // error is swallowed; could add toast here
    } finally {
      setSaving(false);
    }
  }

  function setHomeRoute(route: string) {
    if (!selectedRole) return;
    setSelectedRole({ ...selectedRole, homeRoute: route });
  }

  // Module keys this role currently has view access to, expressed in the
  // SIDEBAR's own UI key namespace (not the raw permission-module-key
  // namespace ACCESS_HIERARCHY uses) -- moduleOrder is matched against
  // NAV_GROUPS item.key in components/sidebar.tsx, so saving raw
  // permission keys here silently reordered nothing for any module whose
  // sidebar key differs from its permission key (most of the "masters-*"
  // pages). Deduped by sidebar key since a couple of real modules share
  // one sidebar entry.
  const grantedModuleKeys = useMemo(() => {
    if (!selectedRole) return [];
    const all: { key: string; label: string }[] = [];
    ACCESS_HIERARCHY.forEach((cat) => {
      (cat.modules ?? []).forEach((m) => all.push(m));
      (cat.subcategories ?? []).forEach((sc) => sc.modules.forEach((m) => all.push(m)));
    });
    const viewGranted = all.filter((m) =>
      selectedRole.permissions.includes(buildCode(m.key, "view"))
    );
    const bySidebarKey = new Map<string, string>();
    viewGranted.forEach((m) => {
      const sk = toSidebarKey(m.key);
      if (!bySidebarKey.has(sk)) {
        bySidebarKey.set(sk, STATIC_MODULES.find((sm) => sm.key === sk)?.label || m.label);
      }
    });
    const order = selectedRole.moduleOrder?.length ? selectedRole.moduleOrder : Array.from(bySidebarKey.keys());
    const ordered = order.filter((k) => bySidebarKey.has(k)).map((k) => ({ key: k, label: bySidebarKey.get(k)! }));
    const placed = new Set(ordered.map((m) => m.key));
    bySidebarKey.forEach((label, key) => { if (!placed.has(key)) ordered.push({ key, label }); });
    return ordered;
  }, [selectedRole]);

  function moveModule(key: string, dir: -1 | 1) {
    if (!selectedRole) return;
    const current = grantedModuleKeys.map((m) => m.key);
    const idx = current.indexOf(key);
    const swapWith = idx + dir;
    if (idx < 0 || swapWith < 0 || swapWith >= current.length) return;
    [current[idx], current[swapWith]] = [current[swapWith], current[idx]];
    setSelectedRole({ ...selectedRole, moduleOrder: current });
  }

  async function createRole() {
    if (!newRoleName.trim() || !newRoleCode.trim()) return;
    try {
      // Was never sending a businessId at all -- every new role landed
      // with businessId: null, which the (now-fixed) visibleRoles filter
      // treats as "belongs to AN Group", so it showed up under every
      // business. A role is now always created under whichever business
      // is currently active (AN Group's own real id if that's selected),
      // and stays exclusive to it.
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newRoleName,
          code: newRoleCode,
          color: newRoleColor,
          permissions: [],
          businessId: activeBusinessId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create role");
        return;
      }
      // Per explicit direction: "let me see the role id once it is saved."
      toast.success(`Role created — ID ${data.role?.roleNumber || data.role?._id}`);
      await refetchRoles();
      setCreating(false);
      setNewRoleName("");
      setNewRoleCode("");
      setNewRoleColor("#6366f1");
    } catch {
      toast.error("Failed to create role");
    }
  }

  async function deleteRole(role: Role) {
    try {
      const qs = new URLSearchParams({ businessId: String(role.businessId ?? activeBusinessId) });
      await fetch(`/api/admin/roles/${role._id}?${qs.toString()}`, { method: "DELETE" });
      const updated = roles.filter((r) => r._id !== role._id);
      refetchRoles((current: any) => ({ ...(current || {}), roles: updated }), false);
      if (selectedRole?._id === role._id) {
        setSelectedRole(null);
      }
      setDeleteModal({ open: false, role: null });
    } catch {
      // error is swallowed; could add toast here
    }
  }

  function handleNameChange(val: string) {
    setNewRoleName(val);
    setNewRoleCode(val.toUpperCase().replace(/\s+/g, "_"));
  }

  // Filter the (dynamic, admin-editable) hierarchy by module label/key
  // when searching, and hide only modules this business has EXPLICITLY
  // disabled from Business > Modules -- see businessDisabledKeys' own
  // comment for why "not configured" must never mean "hidden" here.
  const filteredHierarchy = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matchesCat = (m: EffModule) => {
      if (q && !m.label.toLowerCase().includes(q) && !m.key.includes(q)) return false;
      if (businessDisabledKeys.has(toSidebarKey(m.key)) || businessDisabledKeys.has(m.key)) return false;
      return true;
    };
    return hierarchy
      .map((cat) => {
        const subcategories = cat.subcategories
          .map((sc) => {
            const modules = sc.modules.filter(matchesCat);
            return modules.length || sc.isCustom ? { ...sc, modules } : null;
          })
          .filter((sc): sc is NonNullable<typeof sc> => sc !== null);
        return subcategories.length || cat.isCustom ? { ...cat, subcategories } : null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
  }, [search, hierarchy, businessDisabledKeys]);

  // Strict per-business role isolation: a role created under Business A
  // must never show up (or be selectable/appliable) under Business B or
  // any other business. AN Group is the one exception, since it's also
  // where the legacy platform-wide system roles (SUPER_ADMIN, ADMIN,
  // EMPLOYEE, the CUSTOMER floor roles) still live with businessId: null
  // in the database -- those are treated as belonging to AN Group, not as
  // "visible everywhere". Was previously `!r.businessId || r.businessId
  // === activeBusinessId`, which (combined with createRole never sending a
  // businessId at all) meant every newly-created role defaulted to
  // "visible under every business", exactly the leak reported.
  const visibleRoles = useMemo(() => {
    if (!activeBusinessId) return roles;
    if (activeBusinessId === anGroupBusinessId) {
      return roles.filter((r) => !r.businessId || r.businessId === anGroupBusinessId);
    }
    return roles.filter((r) => r.businessId === activeBusinessId);
  }, [roles, activeBusinessId, anGroupBusinessId]);

  const rowCls =
    "flex items-center justify-between gap-4 px-4 py-2.5 border-b border-border last:border-0";

  function renderModuleRow(moduleKey: string, label: string, currentParentKey?: string, description?: string) {
    if (!selectedRole) return null;
    const moduleCodes = STANDARD_ACTIONS.map((a) => buildCode(moduleKey, a.key));
    const grantedCount = moduleCodes.filter((c) => selectedRole.permissions.includes(c)).length;
    const allGranted = grantedCount === moduleCodes.length;

    return (
      <div key={moduleKey} className="flex flex-col gap-2 px-4 py-2.5 border-b border-border last:border-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => toggleModule(moduleKey, !allGranted)}
              title={allGranted ? "Revoke all privileges for this module" : "Grant all privileges for this module"}
              className={`text-[10px] font-semibold px-2 py-1 rounded shrink-0 ${
                allGranted
                  ? "bg-success-soft text-success"
                  : grantedCount > 0
                  ? "bg-warning-soft text-warning"
                  : "bg-surface-2 text-ink-3"
              }`}
            >
              {grantedCount}/{moduleCodes.length}
            </button>
            <span className="text-sm font-medium text-ink">{label}</span>
            {currentParentKey && (
              <select
                value={currentParentKey}
                onChange={(e) => moveModuleTo(moduleKey, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                title="Move this module to a different category/subcategory"
                className="text-[10px] border border-border rounded px-1.5 py-1 text-ink-3 bg-surface outline-none"
              >
                {allSubcategories.map((sc) => (
                  <option key={sc.key} value={sc.key}>{sc.label}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 justify-end">
            {STANDARD_ACTIONS.map((action) => {
              const code = buildCode(moduleKey, action.key);
              const active = selectedRole.permissions.includes(code);
              return (
                <button
                  key={action.key}
                  onClick={() => togglePermission(code)}
                  title={action.description}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                    active
                      ? "bg-accent text-accent-fg"
                      : "border border-border text-ink-3 hover:border-border-strong hover:text-ink-2"
                  }`}
                >
                  {action.label}
                </button>
              );
            })}
          </div>
        </div>
        {/* Always-visible plain-language summary of what this module's
            access grants -- was previously only in each action button's
            hover title, easy to miss entirely. */}
        {description && <p className="text-xs text-ink-3 pl-1">{description}</p>}
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-surface-2 overflow-hidden">
      {/* Left Panel */}
      <aside className="w-72 bg-surface border-r border-border flex flex-col flex-shrink-0">
        <div className="px-4 py-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink">Roles</h2>
            <button
              onClick={() => setCreating(true)}
              className="px-3 py-1.5 text-xs font-medium bg-accent text-accent-fg rounded-md hover:bg-surface-3 transition-colors"
            >
              Create Role
            </button>
          </div>
          {/* Active business context -- filters both the role list below
              and the module tree on the right to what this business
              actually has enabled. */}
          <select
            value={activeBusinessId}
            onChange={(e) => setActiveBusinessId(e.target.value)}
            className="w-full text-xs border border-border rounded-md px-2.5 py-2 text-ink-2 bg-surface outline-none focus:border-border-strong"
          >
            {[...businesses].sort((a, b) => (b.isPlatform ? 1 : 0) - (a.isPlatform ? 1 : 0)).map((b) => (
              <option key={b._id} value={b._id}>{b.isPlatform ? "AN Group" : b.name}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-ink-3">
              Loading...
            </div>
          ) : visibleRoles.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-ink-3">
              No roles found for this business
            </div>
          ) : (
            <ul className="py-1">
              {visibleRoles.map((role) => {
                const isSelected = selectedRole?._id === role._id;
                return (
                  <li key={role._id}>
                    <button
                      onClick={() => setSelectedRole(role)}
                      className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors group ${
                        isSelected
                          ? "bg-surface-2 border-l-2 border-ink"
                          : "border-l-2 border-transparent hover:bg-surface-2"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: role.color || "#6366f1" }}
                        />
                        <span className="text-sm font-medium text-ink truncate">
                          {role.name}
                        </span>
                        {role.roleNumber && (
                          <span className="flex-shrink-0 font-mono text-[10px] text-ink-3">
                            {role.roleNumber}
                          </span>
                        )}
                        {role.isSystem && (
                          <span className="flex-shrink-0 px-1.5 py-0.5 text-xs font-medium bg-info-soft text-info rounded">
                            System
                          </span>
                        )}
                      </div>
                      {!role.isSystem && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteModal({ open: true, role });
                          }}
                          className="flex-shrink-0 ml-2 p-1 text-ink-3 hover:text-danger rounded transition-colors opacity-0 group-hover:opacity-100"
                          aria-label={`Delete ${role.name}`}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* Right Panel */}
      <main className="flex-1 bg-surface-2 flex flex-col overflow-hidden">
        {!selectedRole ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-ink-3">Select a role to manage permissions</p>
          </div>
        ) : (
          <>
            {/* Role Header */}
            <div className="bg-surface border-b border-border px-6 py-4 flex items-center justify-between flex-shrink-0 gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: selectedRole.color || "#6366f1" }}
                />
                <div className="min-w-0">
                  <h1 className="text-base font-semibold text-ink truncate">{selectedRole.name}</h1>
                  {selectedRole.description && (
                    <p className="text-xs text-ink-3 mt-0.5 truncate">{selectedRole.description}</p>
                  )}
                </div>
                <button
                  onClick={() => setEditRoleModal({ name: selectedRole.name, description: selectedRole.description || "" })}
                  title="Edit role name/description"
                  className="p-1 text-ink-3 hover:text-ink-2 shrink-0"
                  aria-label="Edit role"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {selectedRole.isSystem && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-info-soft text-info rounded shrink-0">
                    System
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <select
                  value={selectedRole.homeRoute || ""}
                  onChange={(e) => setHomeRoute(e.target.value)}
                  title="Page a user with this role lands on right after login"
                  className="w-48 bg-surface border border-border rounded-control px-3 py-2 text-xs text-ink outline-none focus:border-border-strong transition"
                >
                  <option value="">Home Page: Default</option>
                  {STATIC_MODULES.map((m) => (
                    <option key={m.route} value={m.route}>Home Page: {m.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search modules…"
                  className="w-48 bg-surface border border-border rounded-control px-3 py-2 text-xs text-ink placeholder-ink-3 outline-none focus:border-border-strong transition"
                />
                <button
                  onClick={savePermissions}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-accent-fg rounded-md hover:bg-surface-3 disabled:opacity-60 transition-colors"
                >
                  {saving && <Spinner size={16} />}
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>

            {/* Hierarchical Permission Tree: Category > Subcategory > Module > Privilege */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {grantedModuleKeys.length > 0 && (
                <div className="rounded-card border border-border bg-surface overflow-hidden">
                  <div className="px-5 py-3 bg-surface-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-ink-2">
                      Sidebar Order
                    </span>
                    <p className="text-[11px] text-ink-3 mt-0.5">
                      Re-arrange the order these modules appear in the sidebar for this role (e.g. CRM Dashboard before Appointments).
                    </p>
                  </div>
                  <div>
                    {grantedModuleKeys.map((m, i) => (
                      <div key={m.key} className={rowCls}>
                        <span className="text-sm text-ink">{m.label}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => moveModule(m.key, -1)}
                            disabled={i === 0}
                            className="p-1 rounded text-ink-3 hover:text-ink disabled:opacity-30 disabled:hover:text-ink-3"
                            aria-label={`Move ${m.label} up`}
                          >
                            <ChevronDown className="w-4 h-4 rotate-180" />
                          </button>
                          <button
                            onClick={() => moveModule(m.key, 1)}
                            disabled={i === grantedModuleKeys.length - 1}
                            className="p-1 rounded text-ink-3 hover:text-ink disabled:opacity-30 disabled:hover:text-ink-3"
                            aria-label={`Move ${m.label} down`}
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                {addingCategory ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus value={newNodeLabel} onChange={(e) => setNewNodeLabel(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addCategory()}
                      placeholder="New category name…"
                      className="text-xs border border-border rounded-md px-2.5 py-1.5 outline-none focus:border-border-strong"
                    />
                    <button onClick={addCategory} className="text-xs px-2.5 py-1.5 bg-accent text-accent-fg rounded-md">Add</button>
                    <button onClick={() => { setAddingCategory(false); setNewNodeLabel(""); }} className="text-xs px-2.5 py-1.5 text-ink-3">Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingCategory(true)}
                    className="flex items-center gap-1 text-xs font-medium text-ink-2 hover:text-ink"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Category
                  </button>
                )}
              </div>

              {hierarchyLoading ? (
                <p className="text-sm text-ink-3 text-center py-12">Loading hierarchy…</p>
              ) : filteredHierarchy.length === 0 ? (
                <p className="text-sm text-ink-3 text-center py-12">
                  {search ? `No modules match "${search}"` : "No modules enabled for this business yet."}
                </p>
              ) : (
                filteredHierarchy.map((cat) => {
                  const catOpen = openCategories[cat.key] !== false;
                  return (
                    <div key={cat.key} className="rounded-card border border-border bg-surface overflow-hidden">
                      <div className="w-full flex items-center justify-between px-5 py-3 bg-surface-2 hover:bg-surface-2 transition-colors group">
                        <button
                          onClick={() => setOpenCategories((p) => ({ ...p, [cat.key]: !catOpen }))}
                          className="flex items-center gap-2 flex-1 text-left"
                        >
                          <span className="text-xs font-semibold uppercase tracking-wider text-ink-2">
                            {cat.label}
                          </span>
                          {cat.isCustom && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent-soft text-accent">Custom</span>
                          )}
                        </button>
                        <div className="flex items-center gap-1">
                          {cat.isCustom && (
                            <>
                              <button
                                onClick={() => setRenameNodeModal({ key: cat.key, label: cat.label, kind: "category" })}
                                className="p-1 text-ink-3 hover:text-ink-2 opacity-0 group-hover:opacity-100"
                                aria-label={`Rename ${cat.label}`}
                              ><Pencil className="w-3.5 h-3.5" /></button>
                              <button
                                onClick={() => confirm(`Delete category "${cat.label}"? Its modules fall back to Unassigned.`) && deleteNode(cat.key)}
                                className="p-1 text-ink-3 hover:text-danger opacity-0 group-hover:opacity-100"
                                aria-label={`Delete ${cat.label}`}
                              ><Trash2 className="w-3.5 h-3.5" /></button>
                            </>
                          )}
                          <button onClick={() => setOpenCategories((p) => ({ ...p, [cat.key]: !catOpen }))}>
                            {catOpen ? (
                              <ChevronDown className="w-4 h-4 text-ink-3" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-ink-3" />
                            )}
                          </button>
                        </div>
                      </div>

                      {catOpen && (
                        <div>
                          {cat.subcategories.map((sc) => {
                            const scOpen = openSubcategories[sc.key] !== false;
                            return (
                              <div key={sc.key} className="border-t border-border first:border-0">
                                <div className="w-full flex items-center justify-between px-5 py-2 bg-surface-2 hover:bg-surface-2 transition-colors group">
                                  <button
                                    onClick={() => setOpenSubcategories((p) => ({ ...p, [sc.key]: !scOpen }))}
                                    className="flex items-center gap-2 flex-1 text-left"
                                  >
                                    <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                                      {sc.label}
                                    </span>
                                    {sc.isCustom && (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent-soft text-accent">Custom</span>
                                    )}
                                  </button>
                                  <div className="flex items-center gap-1">
                                    {sc.isCustom && sc.key !== cat.key && (
                                      <>
                                        <button
                                          onClick={() => setRenameNodeModal({ key: sc.key, label: sc.label, kind: "subcategory" })}
                                          className="p-1 text-ink-3 hover:text-ink-2 opacity-0 group-hover:opacity-100"
                                          aria-label={`Rename ${sc.label}`}
                                        ><Pencil className="w-3 h-3" /></button>
                                        <button
                                          onClick={() => confirm(`Delete subcategory "${sc.label}"?`) && deleteNode(sc.key)}
                                          className="p-1 text-ink-3 hover:text-danger opacity-0 group-hover:opacity-100"
                                          aria-label={`Delete ${sc.label}`}
                                        ><Trash2 className="w-3 h-3" /></button>
                                      </>
                                    )}
                                    <button onClick={() => setOpenSubcategories((p) => ({ ...p, [sc.key]: !scOpen }))}>
                                      {scOpen ? (
                                        <ChevronDown className="w-3.5 h-3.5 text-ink-3" />
                                      ) : (
                                        <ChevronRight className="w-3.5 h-3.5 text-ink-3" />
                                      )}
                                    </button>
                                  </div>
                                </div>
                                {scOpen && (
                                  <div>{sc.modules.map((m) => renderModuleRow(m.key, m.label, m.parentKey, m.description))}</div>
                                )}
                              </div>
                            );
                          })}

                          {/* Add Subcategory */}
                          <div className="px-5 py-2 border-t border-border">
                            {addingSubFor === cat.key ? (
                              <div className="flex items-center gap-2">
                                <input
                                  autoFocus value={newNodeLabel} onChange={(e) => setNewNodeLabel(e.target.value)}
                                  onKeyDown={(e) => e.key === "Enter" && addSubcategory(cat.key)}
                                  placeholder="New subcategory name…"
                                  className="text-xs border border-border rounded-md px-2.5 py-1.5 outline-none focus:border-border-strong"
                                />
                                <button onClick={() => addSubcategory(cat.key)} className="text-xs px-2.5 py-1.5 bg-accent text-accent-fg rounded-md">Add</button>
                                <button onClick={() => { setAddingSubFor(null); setNewNodeLabel(""); }} className="text-xs px-2.5 py-1.5 text-ink-3">Cancel</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setAddingSubFor(cat.key)}
                                className="flex items-center gap-1 text-[11px] font-medium text-ink-3 hover:text-ink-2"
                              >
                                <Plus className="w-3 h-3" /> Add Subcategory
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </main>

      {/* Create Role Modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-surface rounded-card shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="text-base font-semibold text-ink mb-5">Create Role</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">
                  Role Name
                </label>
                <input
                  type="text"
                  value={newRoleName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Store Manager"
                  className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent placeholder-ink-3"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">
                  Role Code
                </label>
                <input
                  type="text"
                  value={newRoleCode}
                  onChange={(e) => setNewRoleCode(e.target.value)}
                  placeholder="e.g. STORE_MANAGER"
                  className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent placeholder-ink-3 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">
                  Color
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={newRoleColor}
                    onChange={(e) => setNewRoleColor(e.target.value)}
                    className="w-10 h-9 rounded border border-border cursor-pointer p-0.5"
                  />
                  <span className="text-sm text-ink-3 font-mono">{newRoleColor}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setCreating(false);
                  setNewRoleName("");
                  setNewRoleCode("");
                  setNewRoleColor("#6366f1");
                }}
                className="px-4 py-2 text-sm font-medium text-ink-2 border border-border rounded-md hover:bg-surface-2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createRole}
                disabled={!newRoleName.trim() || !newRoleCode.trim()}
                className="px-4 py-2 text-sm font-medium bg-accent text-accent-fg rounded-md hover:bg-surface-3 disabled:opacity-50 transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal.open && deleteModal.role && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-surface rounded-card shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-danger-soft rounded-full flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-danger"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-ink">Delete Role</h3>
                <p className="text-sm text-ink-3 mt-1">
                  Are you sure you want to delete role{" "}
                  <span className="font-medium text-ink">{deleteModal.role.name}</span>?
                  This cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setDeleteModal({ open: false, role: null })}
                className="px-4 py-2 text-sm font-medium text-ink-2 border border-border rounded-md hover:bg-surface-2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteModal.role && deleteRole(deleteModal.role)}
                className="px-4 py-2 text-sm font-medium bg-danger text-accent-fg rounded-md hover:opacity-90 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {editRoleModal && selectedRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setEditRoleModal(null)}>
          <div className="bg-surface rounded-md shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-ink mb-3">Edit Role</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-ink-3 mb-1 block">Role name</label>
                <input
                  autoFocus
                  value={editRoleModal.name}
                  onChange={(e) => setEditRoleModal({ ...editRoleModal, name: e.target.value })}
                  className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-border-strong"
                />
              </div>
              <div>
                <label className="text-xs text-ink-3 mb-1 block">Description (optional)</label>
                <textarea
                  value={editRoleModal.description}
                  onChange={(e) => setEditRoleModal({ ...editRoleModal, description: e.target.value })}
                  rows={3}
                  className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-border-strong resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEditRoleModal(null)} className="px-4 py-2 text-sm font-medium text-ink-2 border border-border rounded-md hover:bg-surface-2 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!editRoleModal.name.trim()) return;
                  setSelectedRole({ ...selectedRole, name: editRoleModal.name.trim(), description: editRoleModal.description || "" });
                  setEditRoleModal(null);
                }}
                className="px-4 py-2 text-sm font-medium bg-accent text-accent-fg rounded-md hover:bg-accent-hover transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {renameNodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setRenameNodeModal(null)}>
          <div className="bg-surface rounded-md shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-ink mb-3">
              Rename {renameNodeModal.kind === "category" ? "Category" : "Subcategory"}
            </h3>
            <input
              autoFocus
              value={renameNodeModal.label}
              onChange={(e) => setRenameNodeModal({ ...renameNodeModal, label: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && renameNodeModal.label.trim()) {
                  renameNode(renameNodeModal.key, renameNodeModal.label.trim());
                  setRenameNodeModal(null);
                }
              }}
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-border-strong"
            />
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setRenameNodeModal(null)} className="px-4 py-2 text-sm font-medium text-ink-2 border border-border rounded-md hover:bg-surface-2 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!renameNodeModal.label.trim()) return;
                  renameNode(renameNodeModal.key, renameNodeModal.label.trim());
                  setRenameNodeModal(null);
                }}
                className="px-4 py-2 text-sm font-medium bg-accent text-accent-fg rounded-md hover:bg-accent-hover transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
