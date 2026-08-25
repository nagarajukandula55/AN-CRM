"use client";

import { useState } from "react";
import useSWR from "swr";
import { Shield, Plus, UserPlus, X, Copy, Check } from "lucide-react";

interface RoleHolder {
  code: string;
  name: string;
  roleId: string;
  users: { _id: string; name?: string; email?: string; username?: string }[];
}

export default function AnGroupStaffPage() {
  const { data: rolesRes, isLoading: loading, mutate: refetchRoles } = useSWR("/api/admin/an-group-staff");
  const roles: RoleHolder[] = rolesRes?.success ? rolesRes.roles || [] : [];
  const loadError = rolesRes && !rolesRes.success ? (rolesRes.error || "Failed to load AN Group staff roles") : null;
  const [error, setError] = useState<string | null>(null);
  const [panelRole, setPanelRole] = useState<string | null>(null);
  const [mode, setMode] = useState<"create" | "assign">("assign");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function openPanel(roleCode: string) {
    setPanelRole(roleCode);
    setMode("assign");
    setName("");
    setUsername("");
    setPassword("");
    setCredentials(null);
    setError(null);
  }

  async function handleSubmit() {
    if (!panelRole) return;
    setSaving(true);
    setError(null);
    try {
      const body =
        mode === "assign"
          ? { mode, roleCode: panelRole, username }
          : { mode, roleCode: panelRole, name, username, password: password || undefined };
      const res = await fetch("/api/admin/an-group-staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed");
      if (data.credentials) {
        setCredentials(data.credentials);
      } else {
        setPanelRole(null);
      }
      refetchRoles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-2 text-ink">
      <div className="max-w-[1800px] mx-auto px-6 py-10">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-6 h-6 text-ink-2" />
          <h1 className="text-2xl font-semibold">AN Group Staff Roles</h1>
        </div>
        <p className="text-sm text-ink-3 mb-8">
          Platform-wide roles for AN Group's own internal team — each grants access across
          every business (not scoped to one), matching that role's real-world responsibility.
          Create a new login for someone, or attach the role to a user who already has an
          account.
        </p>

        {loadError && !panelRole && (
          <div className="mb-6 text-sm text-danger bg-danger-soft border border-danger rounded-card px-4 py-3">{loadError}</div>
        )}

        {loading ? (
          <p className="text-sm text-ink-3">Loading…</p>
        ) : (
          <div className="space-y-3">
            {roles.map((r) => (
              <div key={r.code} className="rounded-card border border-border bg-surface p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-ink">{r.name}</p>
                    <p className="text-xs text-ink-3 mt-0.5">
                      {r.users.length === 0
                        ? "Nobody assigned yet"
                        : r.users.map((u) => u.name || u.username || u.email).join(", ")}
                    </p>
                  </div>
                  <button
                    onClick={() => openPanel(r.code)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-control border border-border text-xs font-medium text-ink-2 hover:bg-surface-2 transition shrink-0"
                  >
                    <UserPlus size={13} /> Assign
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {panelRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setPanelRole(null)} />
          <div className="relative w-full max-w-md max-h-[90vh] bg-surface border border-border rounded-card flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-ink">
                {roles.find((r) => r.code === panelRole)?.name}
              </h2>
              <button onClick={() => setPanelRole(null)} className="p-1 rounded-control hover:bg-surface-2">
                <X size={16} className="text-ink-3" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              {credentials ? (
                <div className="space-y-3">
                  <p className="text-sm text-ink-2">Login created. Copy these credentials now — the password won't be shown again.</p>
                  <div className="rounded-card border border-border bg-surface-2 p-4 space-y-1 font-mono text-sm">
                    <p>User ID: {credentials.username}</p>
                    <p>Password: {credentials.password}</p>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`User ID: ${credentials.username}\nPassword: ${credentials.password}`);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="flex items-center gap-1.5 text-xs font-medium text-ink-2 hover:text-ink"
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
                  </button>
                  <p className="text-xs text-ink-3">They'll be required to set a new password on first login.</p>
                  <button
                    onClick={() => setPanelRole(null)}
                    className="w-full py-2.5 rounded-card bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-hover transition"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex rounded-card border border-border p-1 bg-surface-2">
                    <button
                      onClick={() => setMode("assign")}
                      className={`flex-1 py-2 rounded-control text-xs font-medium transition ${mode === "assign" ? "bg-surface shadow text-ink" : "text-ink-3"}`}
                    >
                      Assign existing user
                    </button>
                    <button
                      onClick={() => setMode("create")}
                      className={`flex-1 py-2 rounded-control text-xs font-medium transition ${mode === "create" ? "bg-surface shadow text-ink" : "text-ink-3"}`}
                    >
                      Create new login
                    </button>
                  </div>

                  {error && <p className="text-xs text-danger">{error}</p>}

                  {mode === "assign" ? (
                    <div>
                      <label className="block text-xs font-medium text-ink-3 mb-1.5">User ID</label>
                      <input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Their existing username"
                        className="w-full bg-surface border border-border rounded-card px-4 py-2.5 text-sm text-ink outline-none focus:border-border-strong"
                      />
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-ink-3 mb-1.5">Full Name</label>
                        <input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full bg-surface border border-border rounded-card px-4 py-2.5 text-sm text-ink outline-none focus:border-border-strong"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-ink-3 mb-1.5">User ID</label>
                        <input
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="e.g. an.sales.admin"
                          className="w-full bg-surface border border-border rounded-card px-4 py-2.5 text-sm text-ink outline-none focus:border-border-strong"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-ink-3 mb-1.5">Password (optional)</label>
                        <input
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Leave blank to use the User ID as the password"
                          className="w-full bg-surface border border-border rounded-card px-4 py-2.5 text-sm text-ink outline-none focus:border-border-strong"
                        />
                      </div>
                    </>
                  )}

                  <button
                    onClick={handleSubmit}
                    disabled={saving}
                    className="w-full py-2.5 rounded-card bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 transition flex items-center justify-center gap-2"
                  >
                    <Plus size={14} /> {saving ? "Saving…" : mode === "assign" ? "Assign Role" : "Create Login"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
