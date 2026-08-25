"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingPanel } from "@/components/ui/Spinner";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { MODULE_LABELS, MODULE_KEYS } from "@/core/billing/moduleCatalog";

interface VendorPlan {
  _id: string;
  name: string;
  description: string;
  moduleKeys: string[];
  price: number;
  validityDays: number;
  isActive: boolean;
  sortOrder: number;
}

const emptyForm = {
  name: "",
  description: "",
  moduleKeys: [] as string[],
  price: "",
  validityDays: "30",
  isActive: true,
  sortOrder: "0",
};

/**
 * Admin catalog editor for self-serve vendor plans (see
 * api/vendor/billing/subscribe, vendor/billing/page.tsx's plan picker).
 * Single vendor type (SC) today -- one shared plan list, no per-type
 * scoping. Fixed-price named plans (not per-module rate entry) -- that
 * ad-hoc per-vendor pricing still lives at console/admin/vendor-billing
 * for cases that need a one-off custom deal instead of a catalog plan.
 */
export default function VendorPlansPage() {
  const { data, isLoading, mutate } = useSWR("/api/admin/vendor-plans");
  const plans: VendorPlan[] = data?.success ? data.plans || [] : [];

  const [editing, setEditing] = useState<VendorPlan | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        description: editing.description || "",
        moduleKeys: editing.moduleKeys,
        price: String(editing.price),
        validityDays: String(editing.validityDays),
        isActive: editing.isActive,
        sortOrder: String(editing.sortOrder || 0),
      });
    }
  }, [editing]);

  function openCreate() {
    setForm(emptyForm);
    setError(null);
    setCreating(true);
  }

  function closeModal() {
    setCreating(false);
    setEditing(null);
    setError(null);
  }

  function toggleModule(key: string) {
    setForm((p) => ({
      ...p,
      moduleKeys: p.moduleKeys.includes(key) ? p.moduleKeys.filter((k) => k !== key) : [...p.moduleKeys, key],
    }));
  }

  async function save() {
    setError(null);
    if (!form.name.trim()) return setError("Plan name is required");
    if (form.moduleKeys.length === 0) return setError("Select at least one module");
    const price = Number(form.price);
    if (!price || price <= 0) return setError("Enter a valid price");

    setSaving(true);
    try {
      const url = editing ? `/api/admin/vendor-plans/${editing._id}` : "/api/admin/vendor-plans";
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim(),
          moduleKeys: form.moduleKeys,
          price,
          validityDays: Number(form.validityDays) || 30,
          isActive: form.isActive,
          sortOrder: Number(form.sortOrder) || 0,
        }),
      });
      const resData = await res.json();
      if (!resData.success) { setError(resData.message || "Failed to save plan"); return; }
      closeModal();
      mutate();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(plan: VendorPlan) {
    await fetch(`/api/admin/vendor-plans/${plan._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...plan, isActive: !plan.isActive }),
    });
    mutate();
  }

  async function deletePlan(plan: VendorPlan) {
    if (!confirm(`Delete plan "${plan.name}"? This won't affect vendors already subscribed to it.`)) return;
    setDeletingId(plan._id);
    try {
      await fetch(`/api/admin/vendor-plans/${plan._id}`, { method: "DELETE" });
      mutate();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-bg text-ink p-6 space-y-6">
      <PageHeader
        title="Vendor Plans"
        description="Fixed-price plans vendors can pick and pay for themselves."
        actions={<Button onClick={openCreate}>New Plan</Button>}
      />

      {isLoading ? (
        <LoadingPanel label="Loading plans…" />
      ) : plans.length === 0 ? (
        <EmptyState kind="empty" title="No plans yet" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <Card key={plan._id} className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="h-section">{plan.name}</h2>
                  {plan.description && <p className="text-xs text-ink-3 mt-0.5">{plan.description}</p>}
                </div>
                <Badge tone={plan.isActive ? "success" : "neutral"}>{plan.isActive ? "Active" : "Inactive"}</Badge>
              </div>

              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-semibold tabular text-ink">₹{plan.price.toLocaleString("en-IN")}</span>
                <span className="text-xs text-ink-3">/ {plan.validityDays} days</span>
              </div>

              <div className="flex flex-wrap gap-1">
                {plan.moduleKeys.map((k) => (
                  <span key={k} className="text-xs bg-surface-2 text-ink-2 rounded-full px-2 py-0.5">
                    {MODULE_LABELS[k] || k}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <Button size="sm" variant="secondary" onClick={() => setEditing(plan)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => toggleActive(plan)}>
                  {plan.isActive ? "Deactivate" : "Activate"}
                </Button>
                <Button size="sm" variant="danger" loading={deletingId === plan._id} onClick={() => deletePlan(plan)}>
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={closeModal}>
          <div
            className="bg-surface border border-border rounded-card shadow-card-lg max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="h-section">{editing ? "Edit Plan" : "New Plan"}</h2>

            {error && <p className="text-sm text-danger bg-danger-soft rounded-control p-2">{error}</p>}

            <Field label="Plan name" required>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Pro" />
            </Field>

            <Field label="Description">
              <Textarea
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                rows={2}
                placeholder="Shown to vendors on the plan picker"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Price (₹)" required>
                <Input type="number" min={0} value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} />
              </Field>
              <Field label="Validity (days)" required>
                <Input type="number" min={1} value={form.validityDays} onChange={(e) => setForm((p) => ({ ...p, validityDays: e.target.value }))} />
              </Field>
            </div>

            <Field label="Modules included" required>
              <div className="grid grid-cols-2 gap-1.5 max-h-56 overflow-y-auto border border-border rounded-control p-2">
                {MODULE_KEYS.map((key) => (
                  <label key={key} className="flex items-center gap-2 text-sm px-1 py-0.5">
                    <input type="checkbox" checked={form.moduleKeys.includes(key)} onChange={() => toggleModule(key)} />
                    <span className="text-ink-2">{MODULE_LABELS[key]}</span>
                  </label>
                ))}
              </div>
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} />
              <span className="text-ink-2">Visible to vendors</span>
            </label>

            <div className="flex items-center gap-2 pt-2">
              <Button onClick={save} loading={saving}>Save Plan</Button>
              <Button variant="ghost" onClick={closeModal}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
