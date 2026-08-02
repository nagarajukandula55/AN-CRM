"use client";

import React, { useState, useEffect, useCallback } from "react";

/**
 * Roles & Access, embedded directly into a business's own view page
 * (admin/business/[id]), same convention as DocumentNumbersPanel on this
 * page -- per explicit direction ("create roles and update allowed pages
 * ... from business settings"). Talks to central-api's shared role
 * catalog via this app's own /api/businesses/[id]/role-catalog proxy
 * (server-to-server, this app's CENTRAL_API_KEY) rather than requiring a
 * separate central-api login.
 */

interface RoleRow {
  id: string;
  categoryKey: string;
  roleName: string;
  allowedPages: string[];
}

interface PageRow {
  _id: string;
  app: string;
  route: string;
  label: string;
  pageKey: string;
}

interface TeamMember {
  id: string;
  email: string;
  name?: string;
  role: string;
  isActive: boolean;
}

export default function RolesAndAccessPanel({ businessId }: { businessId: string }) {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [pages, setPages] = useState<PageRow[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [categoryKey, setCategoryKey] = useState<string | null>(null);
  // Every category key already used by ANY business, so this business can
  // be assigned to an EXISTING one (BRAND/SC/POS/ECOMMERCE/...) via a
  // dropdown instead of free-typed text -- typos or near-duplicates (e.g.
  // "Brand" vs "BRAND") would otherwise silently create a second,
  // disconnected role list. Distinct from vendor categories (a separate
  // classification used at vendor onboarding, not this role/page-access
  // concept) -- see VendorCategoriesPanel.
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState("");
  const [openRoleId, setOpenRoleId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [grantEmail, setGrantEmail] = useState("");
  const [grantRole, setGrantRole] = useState("");
  const [grantMsg, setGrantMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/businesses/${businessId}/role-catalog`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setCategoryKey(data.business?.roleCategoryKey || null);
      setRoles((data.roles || []).filter((r: RoleRow) => !data.business?.roleCategoryKey || r.categoryKey === data.business.roleCategoryKey));
      setPages(data.pages || []);
      setTeam(data.team || []);
      setAllCategories(data.categories || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    load();
  }, [load]);

  const saveCategory = async (value: string) => {
    await fetch(`/api/businesses/${businessId}/role-catalog`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setCategory", roleCategoryKey: value }),
    });
    load();
  };

  const addRole = async () => {
    if (!categoryKey) {
      setMsg("Set a category first.");
      return;
    }
    if (!newRoleName.trim()) return;
    const res = await fetch(`/api/businesses/${businessId}/role-catalog`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "addRole", categoryKey, roleName: newRoleName.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || "Failed to add role");
      return;
    }
    setNewRoleName("");
    setMsg(null);
    load();
  };

  const deleteRole = async (roleId: string) => {
    if (!confirm("Delete this role?")) return;
    await fetch(`/api/businesses/${businessId}/role-catalog`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deleteRole", roleId }),
    });
    load();
  };

  const savePages = async (roleId: string, allowedPages: string[]) => {
    await fetch(`/api/businesses/${businessId}/role-catalog`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setPages", roleId, allowedPages }),
    });
    load();
  };

  const grantAccess = async () => {
    if (!grantEmail.trim()) {
      setGrantMsg("Email is required.");
      return;
    }
    if (!grantRole) {
      setGrantMsg(roles.length === 0 ? "Add a role above first." : "Pick a role.");
      return;
    }
    const res = await fetch(`/api/businesses/${businessId}/role-catalog`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "grantAccess", email: grantEmail.trim(), role: grantRole }),
    });
    const data = await res.json();
    if (!res.ok) {
      setGrantMsg(data.error || "Failed to grant access");
      return;
    }
    setGrantEmail("");
    setGrantMsg(null);
    load();
  };

  const revokeAccess = async (userId: string, email: string) => {
    if (!confirm(`Revoke ${email}'s access to this business?`)) return;
    await fetch(`/api/businesses/${businessId}/role-catalog`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revokeAccess", userId }),
    });
    load();
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 text-sm text-gray-500">
        Loading roles &amp; access...
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">Roles &amp; Access</h3>
        <p className="text-xs text-gray-500 mt-1">
          Define this business&apos;s roles and which pages each one can access. Shared with every AN Group app via
          central-api.
        </p>
      </div>

      <div className="p-5 space-y-5">
        {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg p-3">{error}</div>}

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Role category</label>
          <div className="flex gap-2">
            <select
              value={categoryKey && allCategories.includes(categoryKey) ? categoryKey : ""}
              onChange={(e) => {
                if (e.target.value) saveCategory(e.target.value);
              }}
              className="w-56 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="">
                {categoryKey && !allCategories.includes(categoryKey) ? categoryKey + " (current)" : "-- none --"}
              </option>
              {allCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newCategoryInput}
              onChange={(e) => setNewCategoryInput(e.target.value)}
              placeholder="or type a new one"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <button
              type="button"
              disabled={!newCategoryInput.trim()}
              onClick={() => {
                saveCategory(newCategoryInput.trim());
                setNewCategoryInput("");
              }}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
            >
              Use new
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            Pick an existing category so businesses sharing a role list actually match exactly (no near-duplicate
            typos), or type a genuinely new one. Roles below are scoped to this category.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Add a role</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder="e.g. CCO, Engineer, Warehouse Manager"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <button
              type="button"
              onClick={addRole}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-900 text-white hover:bg-gray-800"
            >
              Add
            </button>
          </div>
          {msg && <p className="text-xs text-red-600 mt-1">{msg}</p>}
        </div>

        <div className="space-y-2">
          {roles.length === 0 ? (
            <p className="text-sm text-gray-400">
              {categoryKey ? "No roles defined for this category yet." : "Set a category above to start adding roles."}
            </p>
          ) : (
            roles.map((r) => (
              <div key={r.id} className="border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm text-gray-900">
                    {r.roleName}{" "}
                    <span className="text-xs text-gray-400 ml-1">
                      {r.allowedPages.length === 0 ? "no pages set" : `${r.allowedPages.length} page(s)`}
                    </span>
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setOpenRoleId(openRoleId === r.id ? null : r.id)}
                      className="text-xs px-3 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                    >
                      Manage pages
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteRole(r.id)}
                      className="text-xs px-3 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {openRoleId === r.id && (
                  <PagesPicker role={r} pages={pages} onSave={(allowed) => savePages(r.id, allowed)} />
                )}
              </div>
            ))
          )}
        </div>

        <div className="border-t border-gray-100 pt-5">
          <h4 className="text-sm font-semibold text-gray-900 mb-1">Team</h4>
          <p className="text-xs text-gray-500 mb-3">
            Grant a specific person access to this business, at one of the roles defined above.
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              value={grantEmail}
              onChange={(e) => setGrantEmail(e.target.value)}
              placeholder="person@example.com"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <select
              value={grantRole}
              onChange={(e) => setGrantRole(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="">Select role</option>
              {roles.map((r) => (
                <option key={r.id} value={r.roleName}>
                  {r.roleName}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={grantAccess}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 whitespace-nowrap"
            >
              Grant
            </button>
          </div>
          {grantMsg && <p className="text-xs text-red-600 mt-1">{grantMsg}</p>}

          <div className="mt-4 space-y-2">
            {team.length === 0 ? (
              <p className="text-sm text-gray-400">Nobody has access to this business yet.</p>
            ) : (
              team.map((m) => (
                <div key={m.id} className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-900">
                    {m.email} {m.name && <span className="text-gray-400">({m.name})</span>}{" "}
                    <span className="text-xs text-gray-500 ml-1 px-2 py-0.5 rounded-full bg-gray-100">{m.role}</span>
                    {!m.isActive && (
                      <span className="text-xs text-red-500 ml-1 px-2 py-0.5 rounded-full bg-red-50">suspended</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => revokeAccess(m.id, m.email)}
                    className="text-xs px-3 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    Revoke
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PagesPicker({ role, pages, onSave }: { role: RoleRow; pages: PageRow[]; onSave: (allowed: string[]) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(role.allowedPages));

  const byApp: Record<string, PageRow[]> = {};
  pages.forEach((p) => {
    (byApp[p.app] = byApp[p.app] || []).push(p);
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (pages.length === 0) {
    return <div className="px-3 pb-3 text-xs text-gray-400">No pages registered yet -- run an app's page-registry migration script.</div>;
  }

  return (
    <div className="px-3 pb-3 border-t border-gray-100 pt-3">
      {Object.keys(byApp).sort().map((app) => (
        <div key={app} className="mb-2">
          <p className="text-xs font-semibold text-gray-500 mb-1">{app}</p>
          {byApp[app].map((p) => (
            <label key={p._id} className="flex items-center gap-2 text-xs text-gray-700 mb-1">
              <input type="checkbox" checked={selected.has(p._id)} onChange={() => toggle(p._id)} />
              {p.label || p.pageKey}
              <span className="text-gray-400 font-mono">{p.route}</span>
            </label>
          ))}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onSave([...selected])}
        className="mt-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-900 text-white hover:bg-gray-800"
      >
        Save
      </button>
    </div>
  );
}
