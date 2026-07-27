"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  X,
  Ruler,
  AlertTriangle,
  Weight,
  Droplets,
  Hash,
  Square,
  Clock,
  Package,
} from "lucide-react";
import { useActiveBusinessId } from "@/hooks/useActiveBusinessId";
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'

interface Unit {
  _id: string;
  name: string;
  symbol: string;
  type: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
}

const UNIT_TYPES = [
  { value: "length", label: "Length", icon: Ruler },
  { value: "weight", label: "Weight", icon: Weight },
  { value: "volume", label: "Volume", icon: Droplets },
  { value: "quantity", label: "Count / Quantity", icon: Hash },
  { value: "time", label: "Time", icon: Clock },
  { value: "other", label: "Other", icon: Package },
];

function typeIcon(type: string) {
  const found = UNIT_TYPES.find((t) => t.value === type);
  const Icon = found?.icon ?? Square;
  return <Icon size={13} />;
}

function typeBadge(type: string) {
  const map: Record<string, string> = {
    length: "text-info bg-info-soft",
    weight: "text-warning bg-warning-soft",
    volume: "text-accent bg-accent-soft",
    quantity: "text-success bg-success-soft",
    time: "text-danger bg-danger-soft",
    other: "text-ink-3 bg-surface-2",
  };
  const cls = map[type] ?? map.other;
  const found = UNIT_TYPES.find((t) => t.value === type);
  const label = found?.label ?? type;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {typeIcon(type)}
      {label}
    </span>
  );
}

interface FormState {
  name: string;
  symbol: string;
  type: string;
  description: string;
}

const DEFAULT_FORM: FormState = {
  name: "",
  symbol: "",
  type: "other",
  description: "",
};

export default function UnitsPage() {
  const { businessId } = useActiveBusinessId();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editUnit, setEditUnit] = useState<Unit | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Delete state
  const [deleteUnit, setDeleteUnit] = useState<Unit | null>(null);
  const [deleting, setDeleting] = useState(false);

  const unitsParams = businessId
    ? (() => {
        const params = new URLSearchParams({ businessId });
        if (debouncedSearch) params.set("search", debouncedSearch);
        if (typeFilter) params.set("type", typeFilter);
        return params.toString();
      })()
    : null;

  const { data: unitsData, isLoading: loading, mutate: fetchUnits } = useSWR(
    unitsParams ? `/api/masters/units?${unitsParams}` : null,
    { keepPreviousData: true }
  );
  const units: Unit[] = unitsData?.success ? unitsData.data ?? [] : [];

  function openAdd() {
    setEditUnit(null);
    setForm(DEFAULT_FORM);
    setFormError("");
    setShowModal(true);
  }

  function openEdit(unit: Unit) {
    setEditUnit(unit);
    setForm({
      name: unit.name,
      symbol: unit.symbol,
      type: unit.type ?? "other",
      description: unit.description ?? "",
    });
    setFormError("");
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditUnit(null);
    setForm(DEFAULT_FORM);
    setFormError("");
  }

  async function handleSave() {
    if (!form.name.trim()) { setFormError("Name is required."); return; }
    if (!form.symbol.trim()) { setFormError("Symbol is required."); return; }
    setFormError("");
    setSaving(true);
    try {
      if (editUnit) {
        const res = await fetch(`/api/masters/units/${editUnit._id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form }),
        });
        const data = await res.json();
        if (!data.success && !data.data) {
          setFormError(data.error ?? "Failed to update unit.");
          return;
        }
      } else {
        const res = await fetch("/api/masters/units", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ businessId, ...form }),
        });
        const data = await res.json();
        if (!data.success && !data.data) {
          setFormError(data.error ?? "Failed to create unit.");
          return;
        }
      }
      closeModal();
      fetchUnits();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteUnit) return;
    setDeleting(true);
    try {
      await fetch(`/api/masters/units/${deleteUnit._id}`, { method: "DELETE" });
      setDeleteUnit(null);
      fetchUnits();
    } finally {
      setDeleting(false);
    }
  }

  const totalByType = UNIT_TYPES.map((t) => ({
    ...t,
    count: units.filter((u) => u.type === t.value).length,
  })).filter((t) => t.count > 0);

  return (
    <div className="p-6 space-y-6 bg-bg min-h-screen">
      <PageHeader
        title="Units of Measurement"
        description="Manage measurement units used across inventory, orders, and products."
        actions={<Button onClick={openAdd} icon={<Plus size={15} />}>Add Unit</Button>}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-xs text-ink-3 mb-1">Total Units</p>
          <p className="tabular text-2xl font-semibold text-ink">{units.length}</p>
        </Card>
        {totalByType.slice(0, 3).map((t) => (
          <Card key={t.value} className="p-4">
            <p className="text-xs text-ink-3 mb-1">{t.label}</p>
            <p className="tabular text-2xl font-semibold text-ink">{t.count}</p>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or symbol…"
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="min-w-[160px] w-auto">
          <option value="">All Types</option>
          {UNIT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </Select>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-xs text-ink-3 font-medium">Name</th>
              <th className="px-4 py-3 text-left text-xs text-ink-3 font-medium">Symbol</th>
              <th className="px-4 py-3 text-left text-xs text-ink-3 font-medium">Type</th>
              <th className="px-4 py-3 text-left text-xs text-ink-3 font-medium hidden md:table-cell">Description</th>
              <th className="px-4 py-3 text-left text-xs text-ink-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right text-xs text-ink-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={6}>
                  <div className="p-12 text-center text-ink-3">Loading…</div>
                </td>
              </tr>
            ) : units.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState kind="empty" title="No units found" action={<Button onClick={openAdd} icon={<Plus size={14} />}>Add your first unit</Button>} />
                </td>
              </tr>
            ) : (
              units.map((unit) => (
                <tr key={unit._id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3 text-sm text-ink font-medium">{unit.name}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono font-semibold text-ink-2 bg-surface-2 px-2 py-0.5 rounded">
                      {unit.symbol}
                    </span>
                  </td>
                  <td className="px-4 py-3">{typeBadge(unit.type ?? "other")}</td>
                  <td className="px-4 py-3 text-xs text-ink-3 hidden md:table-cell max-w-[220px] truncate">
                    {unit.description || <span className="text-ink-3">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={unit.isActive ? 'success' : 'neutral'}>{unit.isActive ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="secondary" size="sm" onClick={() => openEdit(unit)}>
                        <Pencil size={12} />
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => setDeleteUnit(unit)}>
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-lg bg-surface border border-border rounded-card overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex justify-between items-center">
              <h2 className="h-section">
                {editUnit ? "Edit Unit" : "Add Unit"}
              </h2>
              <button onClick={closeModal} className="text-ink-3 hover:text-ink">
                <X size={16} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {formError && (
                <div className="flex items-center gap-2 px-3 py-2 bg-danger-soft border border-danger/20 rounded-control text-xs text-danger">
                  <AlertTriangle size={13} />
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <Field label="Name" required>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Kilogram"
                  />
                </Field>
                <Field label="Symbol" required>
                  <Input
                    value={form.symbol}
                    onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                    placeholder="e.g. kg"
                  />
                </Field>
              </div>

              <Field label="Type">
                <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {UNIT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Description">
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Optional description…"
                  rows={3}
                />
              </Field>
            </div>

            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <Button variant="secondary" size="sm" onClick={closeModal}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving} loading={saving}>
                {saving ? "Saving…" : editUnit ? "Save Changes" : "Add Unit"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-sm bg-surface border border-border rounded-card overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex justify-between items-center">
              <h2 className="h-section">Delete Unit</h2>
              <button onClick={() => setDeleteUnit(null)} className="text-ink-3 hover:text-ink">
                <X size={16} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-danger-soft mx-auto">
                <AlertTriangle size={22} className="text-danger" />
              </div>
              <p className="text-sm text-ink-2 text-center">
                Are you sure you want to delete{" "}
                <span className="text-ink font-semibold">{deleteUnit.name}</span>{" "}
                (<span className="font-mono text-xs">{deleteUnit.symbol}</span>)?
              </p>
              <p className="text-xs text-ink-3 text-center">
                This action cannot be undone. The unit will be removed from your masters.
              </p>
            </div>

            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <Button variant="secondary" size="sm" onClick={() => setDeleteUnit(null)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting} loading={deleting}>
                {deleting ? "Deleting…" : "Delete Unit"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
