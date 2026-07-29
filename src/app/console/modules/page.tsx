"use client";

/**
 * Modules — list of every ModuleDefinition (system + this business's own
 * custom ones), with enable/disable/delete for custom modules. Creating and
 * editing a module's field layout now happens in the dedicated drag-and-drop
 * /console/module-builder page (see that file) rather than the inline form
 * this page used to render — one visual field-layout designer instead of
 * two competing editors for the same ModuleDefinition data.
 */

import { useEffect, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Plus, Trash2, ChevronDown, ChevronUp, Lock, Pencil } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingPanel } from "@/components/ui/Spinner";

type FieldType =
  | "text" | "textarea" | "number" | "boolean" | "date"
  | "select" | "multiselect" | "reference" | "email" | "phone"
  | "currency" | "richtext";

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Text",
  textarea: "Text Area",
  number: "Number",
  boolean: "Yes/No",
  date: "Date",
  select: "Dropdown (single choice)",
  multiselect: "Dropdown (multiple choice)",
  reference: "Reference to another module",
  email: "Email",
  phone: "Phone",
  currency: "Currency",
  richtext: "Rich Text",
};

interface FieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
}

interface BusinessOption {
  _id: string;
  name: string;
  brandName?: string;
}

interface ModuleDef {
  _id: string;
  key: string;
  label: string;
  pluralLabel: string;
  description?: string;
  route: string;
  isSystem: boolean;
  businessId: string | null;
  fields: FieldDefinition[];
  enabled: boolean;
}

export default function ModulesAdminPage() {
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const { data: meRes, isLoading: meLoading } = useSWR("/api/auth/me");
  const isSuperAdmin = !!meRes?.user?.isSuperAdmin;
  const allBusinesses: BusinessOption[] = meRes?.businesses || [];

  useEffect(() => {
    if (!meRes) return;
    const bId: string | null = meRes?.user?.activeBusinessId || (isSuperAdmin ? null : allBusinesses?.[0]?._id || null);
    setBusinessId(bId);
    if (!bId && !(isSuperAdmin && allBusinesses.length > 0)) {
      setError("No active business context — select a business first to manage its modules.");
    }
  }, [meRes]);

  const { data: modulesRes, isLoading: modulesLoading, mutate: loadModules } = useSWR(
    businessId ? `/api/modules?businessId=${businessId}` : null
  );
  const modules: ModuleDef[] = modulesRes?.success ? modulesRes.modules || [] : [];
  const loading = meLoading || (!!businessId && modulesLoading);

  async function handleToggleEnabled(mod: ModuleDef) {
    if (!businessId || mod.isSystem) return;
    try {
      const res = await fetch(`/api/modules/${mod.key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, enabled: !mod.enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success !== false) {
        await loadModules();
      }
    } catch { /* silent */ }
  }

  async function handleDelete(mod: ModuleDef) {
    if (!businessId || mod.isSystem) return;
    if (!confirm(`Delete the "${mod.label}" module? This cannot be undone, and any records stored under it will become orphaned.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/modules/${mod.key}?businessId=${businessId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        setError(data.error || "Failed to delete module");
        return;
      }
      setNotice("Module deleted.");
      await loadModules();
    } catch {
      setError("Failed to connect to server");
    }
  }

  if (!isSuperAdmin && !loading) {
    return (
      <div className="min-h-screen bg-bg text-ink">
        <EmptyState kind="error" title="Restricted" description="Only Super Admins can manage module definitions." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      <PageHeader
        title="Modules"
        description="Define new business-object types entirely from this UI — each module gets its own fields, records, and permissions automatically."
        actions={
          businessId ? (
            <Link href="/console/module-builder">
              <Button icon={<Plus className="w-4 h-4" />}>New Module</Button>
            </Link>
          ) : undefined
        }
      />

      {isSuperAdmin && allBusinesses.length > 0 && (
        <Card className="mb-6">
          <CardBody className="flex items-center gap-3 py-4">
            <span className="text-xs text-ink-3 shrink-0">Managing modules for:</span>
            <Select className="w-auto" value={businessId ?? ""} onChange={(e) => { setBusinessId(e.target.value || null); setError(null); }}>
              <option value="" disabled>Select a business…</option>
              {allBusinesses.map((b) => (
                <option key={b._id} value={b._id}>{b.brandName || b.name}</option>
              ))}
            </Select>
          </CardBody>
        </Card>
      )}

      {error && (
        <Card className="mb-6 border-danger/30 bg-danger-soft">
          <CardBody className="py-3 text-sm text-danger">{error}</CardBody>
        </Card>
      )}
      {notice && !error && (
        <Card className="mb-6 border-success/30 bg-success-soft">
          <CardBody className="py-3 text-sm text-success">{notice}</CardBody>
        </Card>
      )}

      {!businessId && isSuperAdmin ? (
        <EmptyState kind="empty" title="Select a business" description="Select a business above to manage its modules." />
      ) : loading ? (
        <LoadingPanel label="Loading modules…" />
      ) : modules.length === 0 ? (
        <EmptyState kind="empty" title="No modules yet" />
      ) : (
        <div className="space-y-2">
          {modules.map((mod) => (
            <Card key={mod.key} className="overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <button
                  className="flex items-center gap-2 text-left flex-1 min-w-0"
                  onClick={() => setExpandedKey(expandedKey === mod.key ? null : mod.key)}
                >
                  {expandedKey === mod.key ? <ChevronUp className="w-3.5 h-3.5 text-ink-3 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-ink-3 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate flex items-center gap-1.5">
                      {mod.label}
                      {mod.isSystem && <Badge tone="neutral">System</Badge>}
                      {!mod.enabled && <Badge tone="warning">Disabled</Badge>}
                    </p>
                    <p className="text-xs text-ink-3 truncate">{mod.key} · {mod.route} · {mod.fields.length} field{mod.fields.length === 1 ? "" : "s"}</p>
                  </div>
                </button>

                <div className="flex items-center gap-3 shrink-0">
                  <Link href={mod.route} className="text-xs font-medium text-accent hover:underline">Open</Link>
                  {!mod.isSystem && (
                    <>
                      <button onClick={() => handleToggleEnabled(mod)} className="text-xs text-ink-3 hover:text-ink">
                        {mod.enabled ? "Disable" : "Enable"}
                      </button>
                      <Link href={`/console/module-builder?key=${mod.key}`} className="text-ink-3 hover:text-accent" title="Edit fields">
                        <Pencil className="w-4 h-4" />
                      </Link>
                      <button onClick={() => handleDelete(mod)} className="text-ink-3 hover:text-danger">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {mod.isSystem && (
                    <span className="text-ink-3" title="System modules can't be edited or deleted from here">
                      <Lock className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
              </div>

              {expandedKey === mod.key && (
                <div className="border-t border-border px-4 py-3 bg-surface-2">
                  {mod.description && <p className="text-xs text-ink-3 mb-2">{mod.description}</p>}
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-ink-3 text-left">
                        <th className="pb-1 font-medium">Field</th>
                        <th className="pb-1 font-medium">Key</th>
                        <th className="pb-1 font-medium">Type</th>
                        <th className="pb-1 font-medium">Required</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mod.fields.map((f) => (
                        <tr key={f.key} className="border-t border-border">
                          <td className="py-1.5 text-ink">{f.label}</td>
                          <td className="py-1.5 font-mono text-ink-3">{f.key}</td>
                          <td className="py-1.5 text-ink-3">{FIELD_TYPE_LABELS[f.type] || f.type}</td>
                          <td className="py-1.5 text-ink-3">{f.required ? "Yes" : "No"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
