"use client";

/**
 * Vendor-facing staff management — completes the hierarchy requested:
 * AN Group > Businesses (Tenants) > Vendors under respective businesses >
 * Warehouses under vendors > Staff.
 *
 * A vendor owner adds an EXISTING user (identified by that user's unique
 * `username` — their "vendor code") as staff and assigns them a role. This
 * relies on a general signup existing for plain users first (see
 * /register — customer-level access by default), which the staff member
 * must have done before the vendor can add them here.
 */

import { useState } from "react";
import useSWR from "swr";
import { Plus, Trash2, X } from "lucide-react";
import {
  VENDOR_STAFF_MEMBER_TYPES as MEMBER_TYPES,
  STORE_FRONT_MEMBER_TYPES,
  WAREHOUSE_MEMBER_TYPES,
} from "@/core/constants/businessMemberTypes";
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, Input, Select } from '@/components/ui/Input'

interface StaffRow {
  _id: string;
  vendorRole?: string;
  memberType?: string;
  status?: string;
  userId?: { _id: string; name?: string; email?: string; username?: string } | string;
}

interface VendorRoleOption {
  code: string;
  name: string;
  description?: string;
}

// Base list, plus Store Front/Service Center vs. Warehouse roles — only
// shown once the vendor has the corresponding facility enabled on their
// profile (see VendorProfile.enableStoreFront/enableServiceCenter/
// enableWarehouse, toggled by an admin on the vendor's profile). All three
// lists are drawn from core/constants/businessMemberTypes.ts, the same
// source models/BusinessMember.ts's schema enum uses — never a hand-typed
// duplicate list here.

function staffLabel(u: StaffRow["userId"]): string {
  if (!u) return "—";
  if (typeof u === "string") return u;
  return u.name || u.email || u.username || u._id;
}

export default function VendorStaffPage() {
  const { data, isLoading: loading, mutate: refetchStaff } = useSWR("/api/vendor/staff");
  const staff: StaffRow[] = data?.staff || [];
  const roles: VendorRoleOption[] = data?.roles || [];
  const facilities = {
    enableStoreFront: !!data?.vendor?.enableStoreFront,
    enableServiceCenter: !!data?.vendor?.enableServiceCenter,
    enableWarehouse: !!data?.vendor?.enableWarehouse,
  };
  // SC vendors are single-ID only, by explicit direction -- the applicant
  // who signed up IS the whole account, no team beneath them. The API
  // (grantVendorStaffAccess) already rejects this server-side; hiding the
  // option here just avoids sending someone through a form that will fail.
  const isSingleIdOnly = data?.vendor?.appliedAs === "SC";
  const [showForm, setShowForm] = useState(false);
  // "existing" attaches an already-registered account by their user ID
  // (the original flow, requires Super Admin to have attached them
  // first). "new" creates a brand-new account for someone who has never
  // signed up anywhere -- per explicit direction, vendors should be able
  // to onboard their own staff end-to-end instead of routing every new
  // hire through Super Admin first.
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [username, setUsername] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [vendorRole, setVendorRole] = useState("");
  const [roleCode, setRoleCode] = useState("");
  const [memberType, setMemberType] = useState("VENDOR_HELPER");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCreds, setCreatedCreds] = useState<{ loginUsername: string; temporaryPassword: string } | null>(null);

  const availableMemberTypes = [
    ...MEMBER_TYPES,
    ...(facilities.enableStoreFront || facilities.enableServiceCenter ? STORE_FRONT_MEMBER_TYPES : []),
    ...(facilities.enableWarehouse ? WAREHOUSE_MEMBER_TYPES : []),
  ];

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "existing" && !roleCode) {
      setError("Pick a role — this is what actually grants access, not just a label.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const pickedRole = roles.find((r) => r.code === roleCode);
      const endpoint = mode === "new" ? "/api/vendor/staff/create" : "/api/vendor/staff";
      const body =
        mode === "new"
          ? {
              name: newName,
              email: newEmail || undefined,
              phone: newPhone || undefined,
              vendorRole: vendorRole.trim() || pickedRole?.name || memberType,
              memberType,
              roleCode: roleCode || undefined,
            }
          : {
              username,
              vendorRole: vendorRole.trim() || pickedRole?.name || roleCode,
              memberType,
              roleCode,
            };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to add staff member");
      if (mode === "new" && data.loginUsername) {
        setCreatedCreds({ loginUsername: data.loginUsername, temporaryPassword: data.temporaryPassword });
      }
      setShowForm(false);
      setUsername("");
      setNewName("");
      setNewEmail("");
      setNewPhone("");
      setVendorRole("");
      setRoleCode("");
      await refetchStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  // Reuses the same form to grant an ADDITIONAL role to someone already on
  // the team — same POST endpoint, appends rather than overwrites (see
  // api/vendor/staff/route.ts) so one person can hold multiple roles (e.g.
  // Manager + Finance Manager), same as multiple different people can each
  // independently hold the same role (e.g. three CCOs).
  function openAddRoleFor(row: StaffRow) {
    const uname = typeof row.userId === "object" ? row.userId?.username : undefined;
    if (!uname) return;
    setUsername(uname);
    setVendorRole("");
    setRoleCode("");
    setMemberType(row.memberType || "VENDOR_HELPER");
    setShowForm(true);
  }

  async function handleRemove(id: string) {
    if (!confirm("Remove this staff member's access?")) return;
    await fetch(`/api/vendor/staff/${id}`, { method: "DELETE" });
    await refetchStaff();
  }

  return (
    <div className="min-h-screen bg-bg py-10 px-4">
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader
          title="Staff"
          description={
            isSingleIdOnly
              ? "This account is single-ID only — no team can be added beneath it."
              : "Add existing users as staff by their user ID and assign them a role."
          }
          actions={
            isSingleIdOnly ? null : (
              <Button onClick={() => { setMode("existing"); setShowForm(true); }} icon={<Plus size={16} />}>Add Staff</Button>
            )
          }
        />

        {createdCreds && (
          <Card className="p-4 flex items-start justify-between gap-4 border-success/20 bg-success-soft">
            <div className="text-sm text-success">
              <p className="font-semibold">Employee created — share these login details now, they won&apos;t be shown again:</p>
              <p className="mt-1 tabular text-xs">
                ID: {createdCreds.loginUsername} &nbsp;•&nbsp; Temp password: {createdCreds.temporaryPassword}
              </p>
            </div>
            <button onClick={() => setCreatedCreds(null)} className="p-1 rounded-control hover:bg-success/10 flex-shrink-0">
              <X size={16} className="text-success" />
            </button>
          </Card>
        )}

        {loading ? (
          <div className="text-center text-ink-3 text-sm py-12">Loading…</div>
        ) : staff.length === 0 ? (
          <Card>
            <EmptyState kind="empty" title="No staff added yet" />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th className="text-left px-4 py-3 text-xs text-ink-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 text-xs text-ink-3 font-medium">User ID</th>
                  <th className="text-left px-4 py-3 text-xs text-ink-3 font-medium">Role</th>
                  <th className="text-left px-4 py-3 text-xs text-ink-3 font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {staff.map((s) => (
                  <tr key={s._id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-4 py-3 text-ink font-medium">{staffLabel(s.userId)}</td>
                    <td className="px-4 py-3 tabular text-xs text-ink-2">
                      {typeof s.userId === "object" ? s.userId?.username || "—" : "—"}
                    </td>
                    <td className="px-4 py-3 text-ink-2">{s.vendorRole || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge tone="success">{s.status || "ACTIVE"}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => openAddRoleFor(s)}
                        className="text-xs font-medium text-ink-2 hover:text-ink mr-3"
                      >
                        + Add role
                      </button>
                      <Button variant="danger" size="sm" onClick={() => handleRemove(s._id)}>
                        <Trash2 size={13} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-md bg-surface rounded-card border border-border shadow-card-lg p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="h-section">Add Staff Member</h2>
                <button onClick={() => setShowForm(false)} className="p-1 rounded-control hover:bg-surface-2">
                  <X size={16} className="text-ink-3" />
                </button>
              </div>
              {error && (
                <div className="rounded-control border border-danger/20 bg-danger-soft px-4 py-2.5 text-sm text-danger">{error}</div>
              )}
              <div className="flex rounded-control border border-border p-1 bg-surface-2 text-sm">
                <button
                  type="button"
                  onClick={() => setMode("existing")}
                  className={`flex-1 py-1.5 rounded-control font-medium transition ${mode === "existing" ? "bg-surface shadow-card text-ink" : "text-ink-3"}`}
                >
                  Existing user
                </button>
                <button
                  type="button"
                  onClick={() => setMode("new")}
                  className={`flex-1 py-1.5 rounded-control font-medium transition ${mode === "new" ? "bg-surface shadow-card text-ink" : "text-ink-3"}`}
                >
                  Create new employee
                </button>
              </div>
              <form onSubmit={handleAdd} className="space-y-3">
                {mode === "existing" ? (
                  <Field label="Staff Member's User ID" required hint="They must already have an account (see the general sign-up page) — ask for their user ID.">
                    <Input
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Their unique user ID from signup"
                    />
                  </Field>
                ) : (
                  <>
                    <Field label="Full Name" required>
                      <Input
                        required
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="e.g. Ramesh Kumar"
                      />
                    </Field>
                    <Field label="Email (optional)">
                      <Input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="Leave blank if they have none"
                      />
                    </Field>
                    <Field label="Phone (optional)">
                      <Input
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                      />
                    </Field>
                    <p className="text-[10px] text-ink-3">
                      A brand-new login is created just for your team — you&apos;ll get their ID and a
                      temporary password to hand them once saved.
                    </p>
                  </>
                )}
                <Field
                  label={`Role ${mode === "existing" ? "*" : "(optional)"}`}
                  hint={roleCode ? roles.find((r) => r.code === roleCode)?.description : "This is what actually grants access — the same role can be given to multiple people (e.g. three CCOs), and one person can hold several roles at once via \"+ Add role\"."}
                >
                  <Select
                    required={mode === "existing"}
                    value={roleCode}
                    onChange={(e) => setRoleCode(e.target.value)}
                  >
                    <option value="">Select a role…</option>
                    {roles.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Category">
                  <Select value={memberType} onChange={(e) => setMemberType(e.target.value)}>
                    {availableMemberTypes.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Display Title (optional)">
                  <Input
                    value={vendorRole}
                    onChange={(e) => setVendorRole(e.target.value)}
                    placeholder="Defaults to the role name above"
                  />
                </Field>
                <Button type="submit" disabled={saving} loading={saving} className="w-full">
                  Add Staff Member
                </Button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
