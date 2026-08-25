"use client";

/**
 * Vendor-facing warehouse management — part of the vendor hierarchy layer
 * (AN Group > Businesses > Vendors > Warehouses > Staff). A vendor manages
 * their own warehouses here; the API (/api/warehouses) automatically scopes
 * everything to the logged-in vendor's own vendorId (see
 * app/api/warehouses/route.js), so a vendor can never see or touch another
 * vendor's or the business's own warehouses.
 */

import { useState } from "react";
import useSWR from "swr";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import ExportCsvButton from "@/components/shared/ExportCsvButton";
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, Input, Select } from '@/components/ui/Input'

interface WarehouseRow {
  _id: string;
  warehouseCode: string;
  warehouseName: string;
  warehouseType: string;
  contactPerson?: string;
  mobile?: string;
  email?: string;
  city?: string;
  state?: string;
  capacity?: number;
  active: boolean;
}

const WAREHOUSE_TYPES = ["RAW_MATERIAL", "FINISHED_GOODS", "DISTRIBUTION", "STORE", "PRODUCTION", "SERVICE_CENTER"];

const emptyForm = {
  warehouseCode: "",
  warehouseName: "",
  warehouseType: "FINISHED_GOODS",
  contactPerson: "",
  mobile: "",
  email: "",
  city: "",
  state: "",
  capacity: 0,
};

export default function VendorWarehousesPage() {
  const { data, isLoading: loading, mutate: refetchWarehouses } = useSWR("/api/warehouses");
  const warehouses: WarehouseRow[] = data?.data || [];
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
    setError(null);
  }

  function openEdit(w: WarehouseRow) {
    setForm({
      warehouseCode: w.warehouseCode,
      warehouseName: w.warehouseName,
      warehouseType: w.warehouseType,
      contactPerson: w.contactPerson || "",
      mobile: w.mobile || "",
      email: w.email || "",
      city: w.city || "",
      state: w.state || "",
      capacity: w.capacity || 0,
    });
    setEditingId(w._id);
    setShowForm(true);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(editingId ? `/api/warehouses/${editingId}` : "/api/warehouses", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const respData = await res.json();
      if (!res.ok || !respData.success) throw new Error(respData.message || "Failed to save warehouse");
      setShowForm(false);
      await refetchWarehouses();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this warehouse?")) return;
    await fetch(`/api/warehouses/${id}`, { method: "DELETE" });
    await refetchWarehouses();
  }

  return (
    <div className="min-h-screen bg-bg py-10 px-4">
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader
          title="Warehouses"
          description="Manage your own storage/fulfilment locations."
          actions={
            <>
              <ExportCsvButton
                filename="warehouses"
                rows={warehouses}
                columns={[
                  { header: "Code", value: (r: WarehouseRow) => r.warehouseCode },
                  { header: "Name", value: (r: WarehouseRow) => r.warehouseName },
                  { header: "Type", value: (r: WarehouseRow) => r.warehouseType },
                  { header: "City", value: (r: WarehouseRow) => r.city },
                  { header: "State", value: (r: WarehouseRow) => r.state },
                  { header: "Capacity", value: (r: WarehouseRow) => r.capacity },
                  { header: "Active", value: (r: WarehouseRow) => r.active },
                ]}
              />
              <Button onClick={openCreate} icon={<Plus size={16} />}>Add Warehouse</Button>
            </>
          }
        />

        {loading ? (
          <div className="text-center text-ink-3 text-sm py-12">Loading…</div>
        ) : warehouses.length === 0 ? (
          <Card>
            <EmptyState kind="empty" title="No warehouses yet" description="Add your first one." />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th className="text-left px-4 py-3 text-xs text-ink-3 font-medium">Code</th>
                  <th className="text-left px-4 py-3 text-xs text-ink-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 text-xs text-ink-3 font-medium">Type</th>
                  <th className="text-left px-4 py-3 text-xs text-ink-3 font-medium">Location</th>
                  <th className="text-left px-4 py-3 text-xs text-ink-3 font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {warehouses.map((w) => (
                  <tr key={w._id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-4 py-3 tabular text-xs text-ink-2">{w.warehouseCode}</td>
                    <td className="px-4 py-3 text-ink font-medium">{w.warehouseName}</td>
                    <td className="px-4 py-3 text-ink-2">{w.warehouseType.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 text-ink-2">{[w.city, w.state].filter(Boolean).join(", ") || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge tone={w.active ? 'success' : 'neutral'}>{w.active ? "Active" : "Inactive"}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => openEdit(w)}>
                          <Pencil size={13} />
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => handleDelete(w._id)}>
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-lg bg-surface rounded-card border border-border shadow-card-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h2 className="h-section">{editingId ? "Edit Warehouse" : "Add Warehouse"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 rounded-control hover:bg-surface-2">
                  <X size={16} className="text-ink-3" />
                </button>
              </div>
              {error && (
                <div className="rounded-control border border-danger/20 bg-danger-soft px-4 py-2.5 text-sm text-danger">{error}</div>
              )}
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Warehouse Code">
                    <Input
                      placeholder="Auto-generated if left blank"
                      value={form.warehouseCode}
                      onChange={(e) => setForm((f) => ({ ...f, warehouseCode: e.target.value.toUpperCase() }))}
                      disabled={!!editingId}
                    />
                  </Field>
                  <Field label="Type">
                    <Select
                      value={form.warehouseType}
                      onChange={(e) => setForm((f) => ({ ...f, warehouseType: e.target.value }))}
                    >
                      {WAREHOUSE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t.replace(/_/g, " ")}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label="Warehouse Name" required>
                  <Input
                    required
                    placeholder="e.g. Main Distribution Warehouse"
                    value={form.warehouseName}
                    onChange={(e) => setForm((f) => ({ ...f, warehouseName: e.target.value }))}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Contact Person">
                    <Input
                      placeholder="Contact person name"
                      value={form.contactPerson}
                      onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))}
                    />
                  </Field>
                  <Field label="Mobile">
                    <Input
                      placeholder="e.g. 9-digit contact number"
                      value={form.mobile}
                      onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="City">
                    <Input
                      placeholder="City"
                      value={form.city}
                      onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                    />
                  </Field>
                  <Field label="State">
                    <Input
                      placeholder="State"
                      value={form.state}
                      onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                    />
                  </Field>
                </div>
                <Field label="Capacity (units)">
                  <Input
                    type="number"
                    min={0}
                    placeholder="Storage capacity in units"
                    value={form.capacity}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value) }))}
                  />
                </Field>
                <Button type="submit" disabled={saving} loading={saving} className="w-full">
                  {editingId ? "Save Changes" : "Add Warehouse"}
                </Button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
