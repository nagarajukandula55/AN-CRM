"use client";

/**
 * Generic module record page — renders a list + create/edit form for any
 * ModuleDefinition's records purely from its saved field layout (built by
 * /console/module-builder). This is the "read the layout, render the CRUD"
 * half of the Option A dynamic module system: no per-module page is
 * hand-written, the form and columns are generated from
 * ModuleDefinition.fields every time. Server-side validation still runs
 * through validateRecord.ts via the existing /api/modules/:key/records
 * routes — this page never trusts client-side checks alone.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Plus, Pencil, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Field, Input, Textarea, Select } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingPanel } from "@/components/ui/Spinner";

type FieldType =
  | "text" | "textarea" | "number" | "boolean" | "date"
  | "select" | "multiselect" | "reference" | "email" | "phone"
  | "currency" | "richtext";

interface FieldOption { value: string; label: string }

interface FieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: FieldOption[];
  referenceModuleKey?: string;
  helpText?: string;
}

interface ModuleDef {
  key: string;
  label: string;
  pluralLabel: string;
  description?: string;
  fields: FieldDefinition[];
}

interface ModuleRecord {
  _id: string;
  moduleKey: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

function displayValue(field: FieldDefinition, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (field.type === "boolean") return value ? "Yes" : "No";
  if (field.type === "multiselect" && Array.isArray(value)) {
    const opts = field.options || [];
    return value.map((v) => opts.find((o) => o.value === v)?.label ?? String(v)).join(", ") || "—";
  }
  if (field.type === "select") {
    return field.options?.find((o) => o.value === value)?.label ?? String(value);
  }
  if (field.type === "date") {
    const d = new Date(value as string);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
  }
  return String(value);
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDefinition;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (field.type) {
    case "textarea":
    case "richtext":
      return <Textarea rows={3} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "number":
    case "currency":
      return (
        <Input
          type="number"
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
      );
    case "boolean":
      return (
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          {field.label}
        </label>
      );
    case "date":
      return (
        <Input
          type="date"
          value={value ? String(value).slice(0, 10) : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "select":
      return (
        <Select value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {(field.options || []).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      );
    case "multiselect": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-3">
          {(field.options || []).map((o) => (
            <label key={o.value} className="flex items-center gap-1.5 text-xs text-ink-2">
              <input
                type="checkbox"
                checked={selected.includes(o.value)}
                onChange={(e) =>
                  onChange(e.target.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value))
                }
              />
              {o.label}
            </label>
          ))}
        </div>
      );
    }
    case "reference":
      return (
        <Input
          value={(value as string) ?? ""}
          placeholder={field.referenceModuleKey ? `Record ID from "${field.referenceModuleKey}"` : "Record ID"}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "email":
      return <Input type="email" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "phone":
      return <Input type="tel" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    default:
      return <Input value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
  }
}

export default function ModuleRecordsPage() {
  const params = useParams<{ key: string }>();
  const moduleKey = params.key;

  const [businessId, setBusinessId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  const { data: meRes, isLoading: meLoading } = useSWR("/api/auth/me");
  useEffect(() => {
    if (!meRes) return;
    const bId: string | null = meRes?.user?.activeBusinessId || meRes?.businesses?.[0]?._id || null;
    setBusinessId(bId);
  }, [meRes]);

  const { data: modRes, isLoading: modLoading } = useSWR(
    businessId ? `/api/modules/${moduleKey}?businessId=${businessId}` : null
  );
  const moduleDef: ModuleDef | null = modRes?.success ? modRes.module : null;

  const { data: recRes, isLoading: recLoading, mutate: reloadRecords } = useSWR(
    businessId ? `/api/modules/${moduleKey}/records?businessId=${businessId}` : null
  );
  const records: ModuleRecord[] = recRes?.success ? recRes.records || [] : [];

  const loading = meLoading || (!!businessId && (modLoading || recLoading));

  // Show up to the first 4 fields as list columns — the rest are only
  // shown in the create/edit form, to keep the list readable for modules
  // with many fields.
  const columnFields = (moduleDef?.fields || []).slice(0, 4);

  function startCreate() {
    setFormData({});
    setEditingId(null);
    setFieldErrors({});
    setError(null);
    setShowForm(true);
  }

  function startEdit(record: ModuleRecord) {
    setFormData({ ...record.data });
    setEditingId(record._id);
    setFieldErrors({});
    setError(null);
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setFormData({});
    setFieldErrors({});
  }

  async function handleSave() {
    if (!businessId || !moduleDef) return;
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = editingId
        ? await fetch(`/api/modules/${moduleKey}/records/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ businessId, data: formData }),
          })
        : await fetch(`/api/modules/${moduleKey}/records`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ businessId, data: formData }),
          });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        setError(data.error || "Failed to save record.");
        if (Array.isArray(data.fieldErrors)) {
          const fe: Record<string, string> = {};
          for (const e of data.fieldErrors) fe[e.field] = e.message;
          setFieldErrors(fe);
        }
        return;
      }
      cancelForm();
      await reloadRecords();
    } catch {
      setError("Failed to connect to server.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(record: ModuleRecord) {
    if (!businessId) return;
    if (!confirm("Delete this record? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/modules/${moduleKey}/records/${record._id}?businessId=${businessId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        setError(data.error || "Failed to delete record.");
        return;
      }
      await reloadRecords();
    } catch {
      setError("Failed to connect to server.");
    }
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      <PageHeader
        eyebrow="Module"
        title={moduleDef?.pluralLabel || moduleKey}
        description={moduleDef?.description}
        actions={
          <>
            <Link href="/console/modules">
              <Button variant="secondary" icon={<ArrowLeft className="w-4 h-4" />}>Back to Modules</Button>
            </Link>
            {moduleDef && (
              <Button icon={<Plus className="w-4 h-4" />} onClick={startCreate}>
                New {moduleDef.label}
              </Button>
            )}
          </>
        }
      />

      {error && (
        <Card className="mb-6 border-danger/30 bg-danger-soft">
          <CardBody className="py-3 text-sm text-danger">{error}</CardBody>
        </Card>
      )}

      {loading ? (
        <LoadingPanel label="Loading…" />
      ) : !moduleDef ? (
        <EmptyState kind="error" title="Module not found" description="This module may have been deleted or is not available for your business." />
      ) : (
        <>
          {showForm && (
            <Card className="mb-6">
              <CardBody>
                <div className="flex items-center justify-between mb-4">
                  <p className="h-section">{editingId ? `Edit ${moduleDef.label}` : `New ${moduleDef.label}`}</p>
                  <button onClick={cancelForm} className="text-ink-3 hover:text-ink">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {moduleDef.fields.map((field) => (
                    <Field
                      key={field.key}
                      label={field.type === "boolean" ? undefined : field.label}
                      required={field.required}
                      hint={field.helpText}
                      error={fieldErrors[field.key]}
                      className={field.type === "textarea" || field.type === "richtext" || field.type === "multiselect" ? "md:col-span-2" : undefined}
                    >
                      <FieldInput
                        field={field}
                        value={formData[field.key]}
                        onChange={(v) => setFormData((prev) => ({ ...prev, [field.key]: v }))}
                      />
                    </Field>
                  ))}
                  {moduleDef.fields.length === 0 && (
                    <p className="text-sm text-ink-3 md:col-span-2">
                      This module has no fields yet — add some in the Module Builder first.
                    </p>
                  )}
                </div>
                <div className="flex justify-end gap-2 mt-6">
                  <Button variant="secondary" onClick={cancelForm}>Cancel</Button>
                  <Button onClick={handleSave} loading={saving}>Save</Button>
                </div>
              </CardBody>
            </Card>
          )}

          {records.length === 0 ? (
            <EmptyState
              kind="empty"
              title={`No ${moduleDef.pluralLabel.toLowerCase()} yet`}
              description="Create the first record to get started."
              action={<Button icon={<Plus className="w-4 h-4" />} onClick={startCreate}>New {moduleDef.label}</Button>}
            />
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    {columnFields.map((f) => (
                      <th key={f.key} className="px-4 py-3 font-medium text-ink-3 text-xs">{f.label}</th>
                    ))}
                    <th className="px-4 py-3 font-medium text-ink-3 text-xs text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record._id} className="border-b border-border last:border-0 hover:bg-surface-2">
                      {columnFields.map((f) => (
                        <td key={f.key} className="px-4 py-3 text-ink">{displayValue(f, record.data[f.key])}</td>
                      ))}
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-3">
                          <button onClick={() => startEdit(record)} className="text-ink-3 hover:text-accent" title="Edit">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(record)} className="text-ink-3 hover:text-danger" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
