"use client";

import { useState } from "react";
import useSWR from "swr";
import HsnSearchSelect from "@/components/shared/HsnSearchSelect";
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, Input, Select } from '@/components/ui/Input'

const UNIT_OPTIONS = ["kg", "g", "l", "ml", "pcs", "pack", "box", "dozen"];
const MATERIAL_TYPES = [
  { value: "RAW_MATERIAL", label: "Raw Material" },
  { value: "PACKAGING_MATERIAL", label: "Packaging Material" },
  { value: "CONSUMABLE", label: "Consumable" },
  { value: "LABEL", label: "Label" },
  { value: "BOX", label: "Box" },
  { value: "SEMI_FINISHED", label: "Semi-Finished" },
  { value: "SERVICE", label: "Service" },
];
const GST_RATES = [0, 5, 12, 18, 28];

interface MaterialForm {
  materialName: string;
  materialType: string;
  categoryId: string;
  unit: string;
  hsnCode: string;
  gstRate: string;
  currentPrice: string;
}

const EMPTY_FORM: MaterialForm = {
  materialName: "", materialType: "RAW_MATERIAL", categoryId: "", unit: "",
  hsnCode: "", gstRate: "", currentPrice: "",
};

export default function VendorMaterialsPage() {
  const [editing, setEditing] = useState<any>(null); // null = closed, "new" or a material doc
  const [form, setForm] = useState<MaterialForm>(EMPTY_FORM);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: materialsRes, isLoading: loading, mutate: refetchMaterials } = useSWR("/api/vendor/materials");
  const materials: any[] = materialsRes?.success ? materialsRes.data || [] : [];

  const { data: categoriesRes, mutate: refetchCategories } = useSWR("/api/vendor/material-categories");
  const categories: { _id: string; name: string }[] = categoriesRes?.success ? categoriesRes.data || [] : [];

  function openNew() {
    setForm(EMPTY_FORM);
    setError(null);
    setEditing("new");
  }

  function openEdit(m: any) {
    setForm({
      materialName: m.materialName || "",
      materialType: m.materialType || "RAW_MATERIAL",
      categoryId: m.categoryId?._id || m.categoryId || "",
      unit: m.stockUnit || "",
      hsnCode: m.hsnCode || "",
      gstRate: m.gstRate !== undefined && m.gstRate !== null ? String(m.gstRate) : "",
      currentPrice: m.currentPrice ? String(m.currentPrice) : "",
    });
    setError(null);
    setEditing(m);
  }

  async function addCategory() {
    if (!newCategoryName.trim()) return;
    const res = await fetch("/api/vendor/material-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCategoryName.trim() }),
    });
    const data = await res.json();
    if (data.success) {
      await refetchCategories();
      setForm((p) => ({ ...p, categoryId: data.data._id }));
      setNewCategoryName("");
      setAddingCategory(false);
    }
  }

  async function save() {
    setError(null);
    if (!form.materialName.trim() || !form.unit.trim()) {
      setError("Name and unit are required.");
      return;
    }
    setSaving(true);
    try {
      const body = {
        materialName: form.materialName.trim(),
        materialType: form.materialType,
        categoryId: form.categoryId || undefined,
        unit: form.unit,
        hsnCode: form.hsnCode.trim() || undefined,
        gstRate: form.gstRate === "" ? undefined : Number(form.gstRate),
        currentPrice: form.currentPrice === "" ? 0 : Number(form.currentPrice),
      };
      const isNew = editing === "new";
      const res = await fetch(isNew ? "/api/vendor/materials" : `/api/vendor/materials/${editing._id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Failed to save material");
        return;
      }
      setEditing(null);
      refetchMaterials();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Materials"
        description="Raw materials, packaging, and other BOM ingredients for your products — including current price, so product BOMs can pull cost from here instead of retyping it every time."
        actions={<Button onClick={openNew}>+ Add Material</Button>}
      />

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
          <div className="w-full max-w-md bg-surface border border-border rounded-card p-5 space-y-3 my-8">
            <h2 className="h-section">{editing === "new" ? "Add Material" : "Edit Material"}</h2>
            {error && <p className="text-xs text-danger">{error}</p>}

            <Input
              placeholder="Material name *"
              value={form.materialName}
              onChange={(e) => setForm((p) => ({ ...p, materialName: e.target.value }))}
            />

            <div className="grid grid-cols-2 gap-2">
              <Select
                value={form.materialType}
                onChange={(e) => setForm((p) => ({ ...p, materialType: e.target.value }))}
              >
                {MATERIAL_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>

              <Select
                value={form.unit}
                onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
              >
                <option value="">Unit *</option>
                {UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </Select>
            </div>

            <div>
              {!addingCategory ? (
                <div className="flex gap-2">
                  <Select
                    className="flex-1"
                    value={form.categoryId}
                    onChange={(e) => setForm((p) => ({ ...p, categoryId: e.target.value }))}
                  >
                    <option value="">Category (optional — defaults to General)</option>
                    {categories.map((c) => (
                      <option key={c._id} value={c._id}>{c.name}</option>
                    ))}
                  </Select>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setAddingCategory(true)}>
                    + New
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    className="flex-1"
                    placeholder="New category name"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                  />
                  <Button type="button" variant="secondary" size="sm" onClick={addCategory}>Add</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setAddingCategory(false)}>✕</Button>
                </div>
              )}
            </div>

            <div className="border-t border-border pt-3">
              <Field label={`Current price (₹ per ${form.unit || "unit"})`} hint="Used to auto-fill this material's rate when you add it to a product's BOM. Every change is logged so price history is kept.">
                <Input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={form.currentPrice}
                  onChange={(e) => setForm((p) => ({ ...p, currentPrice: e.target.value }))}
                />
              </Field>
            </div>

            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-xs text-ink-3">HSN &amp; GST (optional — only needed if this material itself is separately invoiced; not required to just track its cost)</p>
              <HsnSearchSelect
                value={form.hsnCode}
                onChange={(hsnCode) => setForm((p) => ({ ...p, hsnCode }))}
                onSelect={(rate) => setForm((p) => ({ ...p, hsnCode: rate.hsnCode, gstRate: String(rate.gstRate) }))}
              />
              <Select
                value={form.gstRate}
                onChange={(e) => setForm((p) => ({ ...p, gstRate: e.target.value }))}
              >
                <option value="">GST rate — not set</option>
                {GST_RATES.map((r) => (
                  <option key={r} value={r}>{r}%</option>
                ))}
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving} loading={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-3 border-b border-border">
              <th className="p-3 font-medium">Code</th>
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">Type</th>
              <th className="p-3 font-medium">Unit</th>
              <th className="p-3 font-medium">Category</th>
              <th className="p-3 font-medium">Price</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td className="p-4 text-ink-3" colSpan={7}>Loading…</td></tr>
            ) : materials.length === 0 ? (
              <tr><td colSpan={7}><EmptyState kind="empty" title="No materials yet" /></td></tr>
            ) : (
              materials.map((m) => (
                <tr key={m._id} className="hover:bg-surface-2 transition-colors">
                  <td className="p-3 tabular text-xs text-ink-3">{m.materialCode}</td>
                  <td className="p-3 text-ink">{m.materialName}</td>
                  <td className="p-3 text-ink-3">{m.materialType}</td>
                  <td className="p-3 text-ink-3">{m.stockUnit}</td>
                  <td className="p-3 text-ink-3">{m.categoryId?.name || "—"}</td>
                  <td className="p-3 text-ink-2">{m.currentPrice ? `₹${m.currentPrice}/${m.stockUnit}` : "—"}</td>
                  <td className="p-3">
                    <button onClick={() => openEdit(m)} className="text-accent text-xs font-medium">Edit</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
