"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Plus, Trash2, Save, X, ChevronDown, ChevronUp, Lock } from "lucide-react";
import { STANDARD_ACTIONS } from "@/core/access/actions";

type FieldType =
  | "text" | "textarea" | "number" | "boolean" | "date"
  | "select" | "multiselect" | "reference" | "email" | "phone"
  | "currency" | "richtext";

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Text Area" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Yes/No" },
  { value: "date", label: "Date" },
  { value: "select", label: "Dropdown (single choice)" },
  { value: "multiselect", label: "Dropdown (multiple choice)" },
  { value: "reference", label: "Reference to another module" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "currency", label: "Currency" },
  { value: "richtext", label: "Rich Text" },
];

interface FieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  unique?: boolean;
  options?: { value: string; label: string }[];
  helpText?: string;
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
  icon?: string;
  route: string;
  isSystem: boolean;
  businessId: string | null;
  fields: FieldDefinition[];
  enabled: boolean;
  sortOrder: number;
  applicableActions?: string[];
}

const emptyField = (): FieldDefinition => ({
  key: "",
  label: "",
  type: "text",
  required: false,
  unique: false,
  options: [],
  helpText: "",
});

const emptyModule = () => ({
  key: "",
  label: "",
  pluralLabel: "",
  description: "",
  icon: "Box",
  route: "",
  fields: [] as FieldDefinition[],
  // Both already supported by the update/create API (moduleDefinition.
  // service.ts's Pick<>) but never surfaced in this form until now.
  // Empty applicableActions means "all standard actions apply" (the
  // service's own default) -- not surfacing it here wasn't wrong, just
  // incomplete.
  applicableActions: [] as string[],
  sortOrder: 0,
});

export default function ModulesAdminPage() {
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form, setForm] = useState(emptyModule());
  const [saving, setSaving] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const { data: meRes, isLoading: meLoading } = useSWR("/api/auth/me");
  // Real /api/auth/me shape is { success, user: { isSuperAdmin,
  // activeBusinessId, ... }, businesses: [...] } — this was reading
  // me.isSuperAdmin / me.activeBusinessId at the ROOT, which don't
  // exist there, so isSuperAdmin was always false and businessId was
  // always null even for a real super admin (hence the permanent
  // "Only Super Admins can manage module definitions" lockout).
  const isSuperAdmin = !!meRes?.user?.isSuperAdmin;
  const allBusinesses: BusinessOption[] = meRes?.businesses || [];

  useEffect(() => {
    if (!meRes) return;
    // Super admins default to "All Businesses" (no businessId) rather
    // than being forced to pick one — matches the business-switcher
    // dropdown's default elsewhere in the app.
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

  function startCreate() {
    setForm(emptyModule());
    setEditingKey(null);
    setShowCreate(true);
    setError(null);
  }

  function startEdit(mod: ModuleDef) {
    setForm({
      key: mod.key,
      label: mod.label,
      pluralLabel: mod.pluralLabel,
      description: mod.description || "",
      icon: mod.icon || "Box",
      route: mod.route,
      fields: mod.fields.map((f) => ({ ...f })),
      applicableActions: mod.applicableActions || [],
      sortOrder: mod.sortOrder ?? 0,
    });
    setEditingKey(mod.key);
    setShowCreate(true);
    setError(null);
  }

  function cancelForm() {
    setShowCreate(false);
    setEditingKey(null);
    setForm(emptyModule());
  }

  function addField() {
    setForm((prev) => ({ ...prev, fields: [...prev.fields, emptyField()] }));
  }

  function updateField(index: number, updates: Partial<FieldDefinition>) {
    setForm((prev) => {
      const fields = [...prev.fields];
      fields[index] = { ...fields[index], ...updates };
      return { ...prev, fields };
    });
  }

  function removeField(index: number) {
    setForm((prev) => ({ ...prev, fields: prev.fields.filter((_, i) => i !== index) }));
  }

  function addOption(fieldIndex: number) {
    setForm((prev) => {
      const fields = [...prev.fields];
      const options = [...(fields[fieldIndex].options || []), { value: "", label: "" }];
      fields[fieldIndex] = { ...fields[fieldIndex], options };
      return { ...prev, fields };
    });
  }

  function updateOption(fieldIndex: number, optIndex: number, updates: Partial<{ value: string; label: string }>) {
    setForm((prev) => {
      const fields = [...prev.fields];
      const options = [...(fields[fieldIndex].options || [])];
      options[optIndex] = { ...options[optIndex], ...updates };
      fields[fieldIndex] = { ...fields[fieldIndex], options };
      return { ...prev, fields };
    });
  }

  function removeOption(fieldIndex: number, optIndex: number) {
    setForm((prev) => {
      const fields = [...prev.fields];
      const options = (fields[fieldIndex].options || []).filter((_, i) => i !== optIndex);
      fields[fieldIndex] = { ...fields[fieldIndex], options };
      return { ...prev, fields };
    });
  }

  async function handleSave() {
    if (!businessId) return;
    setError(null);

    if (!editingKey) {
      if (!form.key.trim() || !form.label.trim() || !form.pluralLabel.trim() || !form.route.trim()) {
        setError("Key, Label, Plural Label, and Route are required.");
        return;
      }
      if (!/^[a-z][a-z0-9_]*$/.test(form.key.trim())) {
        setError('Key must be lowercase letters, numbers, and underscores only, starting with a letter (e.g. "warranty_claim").');
        return;
      }
    }

    const fieldKeys = new Set<string>();
    for (const f of form.fields) {
      if (!f.key.trim() || !f.label.trim()) {
        setError("Every field needs both a key and a label.");
        return;
      }
      if (fieldKeys.has(f.key)) {
        setError(`Duplicate field key "${f.key}" — each field needs a unique key.`);
        return;
      }
      fieldKeys.add(f.key);
    }

    setSaving(true);
    try {
      let res: Response;
      if (editingKey) {
        res = await fetch(`/api/modules/${editingKey}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessId,
            label: form.label,
            pluralLabel: form.pluralLabel,
            description: form.description,
            icon: form.icon,
            fields: form.fields,
            applicableActions: form.applicableActions,
            sortOrder: form.sortOrder,
          }),
        });
      } else {
        res = await fetch("/api/modules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, businessId }),
        });
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        setError(data.error || "Failed to save module");
        return;
      }

      setNotice(editingKey ? "Module updated." : "Module created.");
      cancelForm();
      await loadModules();
    } catch {
      setError("Failed to connect to server");
    } finally {
      setSaving(false);
    }
  }

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

  const inputClass = "p-2.5 bg-white text-gray-900 border border-gray-200 rounded-lg text-sm w-full";
  const labelClass = "text-xs font-medium text-gray-500";

  if (!isSuperAdmin && !loading) {
    return (
      <div className="p-10 text-center text-gray-500">
        <Lock className="mx-auto mb-3 text-gray-300" size={32} />
        <p>Only Super Admins can manage module definitions.</p>
      </div>
    );
  }

  return (
    <div className="p-8 text-gray-900 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Modules</h1>
          <p className="text-sm text-gray-500 mt-1">
            Define new business-object types entirely from this UI — each module
            gets its own fields, records, and permissions automatically.
          </p>
        </div>

        {!showCreate && businessId && (
          <button
            onClick={startCreate}
            className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700"
          >
            <Plus size={16} /> New Module
          </button>
        )}
      </div>

      {isSuperAdmin && allBusinesses.length > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Managing modules for:</label>
          <select
            value={businessId ?? ""}
            onChange={(e) => {
              const bId = e.target.value || null;
              setBusinessId(bId);
              setError(null);
            }}
            className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-gray-400"
          >
            <option value="" disabled>Select a business…</option>
            {allBusinesses.map((b) => (
              <option key={b._id} value={b._id}>{b.brandName || b.name}</option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && !error && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      {!businessId && isSuperAdmin && (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center text-gray-500 text-sm">
          Select a business above to manage its modules.
        </div>
      )}

      {businessId && showCreate && (
        <div className="mb-8 rounded-2xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">
              {editingKey ? `Edit "${form.label || editingKey}"` : "New Module"}
            </h2>
            <button onClick={cancelForm} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>
                Key {editingKey && <span className="text-gray-400">(cannot be changed)</span>}
              </label>
              <input
                className={inputClass}
                placeholder="e.g. warranty_claim"
                value={form.key}
                disabled={!!editingKey}
                onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase() })}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className={labelClass}>Route</label>
              <input
                className={inputClass}
                placeholder="e.g. /admin/warranty-claims"
                value={form.route}
                disabled={!!editingKey}
                onChange={(e) => setForm({ ...form, route: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className={labelClass}>Label (singular)</label>
              <input
                className={inputClass}
                placeholder="e.g. Warranty Claim"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className={labelClass}>Label (plural)</label>
              <input
                className={inputClass}
                placeholder="e.g. Warranty Claims"
                value={form.pluralLabel}
                onChange={(e) => setForm({ ...form, pluralLabel: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1 col-span-2">
              <label className={labelClass}>Description</label>
              <textarea
                className={inputClass}
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className={labelClass}>Sort Order</label>
              <input
                type="number"
                className={inputClass}
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
              />
            </div>

            <div className="flex flex-col gap-1 col-span-2">
              <label className={labelClass}>
                Applicable Actions <span className="text-gray-400 font-normal">(none checked = all apply)</span>
              </label>
              <div className="flex flex-wrap gap-3">
                {STANDARD_ACTIONS.map((a) => (
                  <label key={a.key} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={form.applicableActions.includes(a.key)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          applicableActions: e.target.checked
                            ? [...form.applicableActions, a.key]
                            : form.applicableActions.filter((k) => k !== a.key),
                        })
                      }
                    />
                    {a.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Fields</h3>
            <button
              onClick={addField}
              className="flex items-center gap-1 text-xs font-medium text-cyan-700 hover:text-cyan-800"
            >
              <Plus size={13} /> Add Field
            </button>
          </div>

          <div className="space-y-3">
            {form.fields.length === 0 && (
              <p className="text-xs text-gray-400 italic">No fields yet — add at least one so this module can store data.</p>
            )}

            {form.fields.map((field, i) => (
              <div key={i} className="rounded-lg border border-gray-200 p-3">
                <div className="grid grid-cols-12 gap-2 items-start">
                  <input
                    className={`${inputClass} col-span-3`}
                    placeholder="field_key"
                    value={field.key}
                    onChange={(e) => updateField(i, { key: e.target.value.toLowerCase() })}
                  />
                  <input
                    className={`${inputClass} col-span-3`}
                    placeholder="Field Label"
                    value={field.label}
                    onChange={(e) => updateField(i, { label: e.target.value })}
                  />
                  <select
                    className={`${inputClass} col-span-3`}
                    value={field.type}
                    onChange={(e) => updateField(i, { type: e.target.value as FieldType })}
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <label className="col-span-2 flex items-center gap-1.5 text-xs text-gray-600 pt-2.5">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) => updateField(i, { required: e.target.checked })}
                    />
                    Required
                  </label>
                  <button
                    onClick={() => removeField(i)}
                    className="col-span-1 flex justify-center pt-2 text-red-400 hover:text-red-600"
                    title="Remove field"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                {(field.type === "select" || field.type === "multiselect") && (
                  <div className="mt-2 pl-3 border-l-2 border-gray-100 space-y-1.5">
                    <p className="text-[11px] text-gray-400">Options</p>
                    {(field.options || []).map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <input
                          className="p-1.5 border border-gray-200 rounded text-xs flex-1"
                          placeholder="value"
                          value={opt.value}
                          onChange={(e) => updateOption(i, oi, { value: e.target.value })}
                        />
                        <input
                          className="p-1.5 border border-gray-200 rounded text-xs flex-1"
                          placeholder="Label"
                          value={opt.label}
                          onChange={(e) => updateOption(i, oi, { label: e.target.value })}
                        />
                        <button onClick={() => removeOption(i, oi)} className="text-red-400 hover:text-red-600">
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => addOption(i)}
                      className="text-[11px] font-medium text-cyan-700 hover:text-cyan-800"
                    >
                      + Add option
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button onClick={cancelForm} className="rounded-lg border border-gray-200 px-4 py-2 text-sm">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
            >
              <Save size={15} /> {saving ? "Saving..." : "Save Module"}
            </button>
          </div>
        </div>
      )}

      {businessId && (loading ? (
        <p className="text-sm text-gray-400">Loading modules…</p>
      ) : (
        <div className="space-y-2">
          {modules.map((mod) => (
            <div key={mod.key} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <button
                  className="flex items-center gap-2 text-left flex-1 min-w-0"
                  onClick={() => setExpandedKey(expandedKey === mod.key ? null : mod.key)}
                >
                  {expandedKey === mod.key ? <ChevronUp size={14} className="text-gray-400 shrink-0" /> : <ChevronDown size={14} className="text-gray-400 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {mod.label}{" "}
                      {mod.isSystem && (
                        <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 align-middle">System</span>
                      )}
                      {!mod.enabled && (
                        <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 align-middle">Disabled</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{mod.key} · {mod.route} · {mod.fields.length} field{mod.fields.length === 1 ? "" : "s"}</p>
                  </div>
                </button>

                <div className="flex items-center gap-3 shrink-0">
                  <Link href={mod.route} className="text-xs text-cyan-700 hover:text-cyan-800">Open</Link>
                  {!mod.isSystem && (
                    <>
                      <button onClick={() => handleToggleEnabled(mod)} className="text-xs text-gray-500 hover:text-gray-700">
                        {mod.enabled ? "Disable" : "Enable"}
                      </button>
                      <button onClick={() => startEdit(mod)} className="text-xs text-gray-500 hover:text-gray-700">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(mod)} className="text-red-400 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                  {mod.isSystem && (
                    <span className="text-xs text-gray-300" title="System modules can't be edited or deleted from here">
                      <Lock size={13} />
                    </span>
                  )}
                </div>
              </div>

              {expandedKey === mod.key && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                  {mod.description && <p className="text-xs text-gray-500 mb-2">{mod.description}</p>}
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 text-left">
                        <th className="pb-1 font-medium">Field</th>
                        <th className="pb-1 font-medium">Key</th>
                        <th className="pb-1 font-medium">Type</th>
                        <th className="pb-1 font-medium">Required</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mod.fields.map((f) => (
                        <tr key={f.key} className="border-t border-gray-100">
                          <td className="py-1.5 text-gray-800">{f.label}</td>
                          <td className="py-1.5 font-mono text-gray-500">{f.key}</td>
                          <td className="py-1.5 text-gray-500">{FIELD_TYPES.find((t) => t.value === f.type)?.label || f.type}</td>
                          <td className="py-1.5 text-gray-500">{f.required ? "Yes" : "No"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}

          {modules.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No modules yet.</p>
          )}
        </div>
      ))}
    </div>
  );
}
