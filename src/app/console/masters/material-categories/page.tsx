"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  X,
  Layers,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { useActiveBusinessId } from "@/hooks/useActiveBusinessId";
import BusinessScopeControl from "@/components/catalog/BusinessScopeControl";
import { CategoryTree } from "@/components/shared/CategoryTree";
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'

interface MaterialCategory {
  _id: string;
  name: string;
  code?: string;
  description?: string;
  parentCategory?: { _id: string; name: string; code?: string } | null;
  unit?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  materialCount?: number;
  businessScope?: "SINGLE" | "MULTIPLE" | "ALL";
  businessIds?: string[];
}

interface ModalState {
  type: "add" | "edit" | "delete" | null;
  category?: MaterialCategory;
}

interface FormData {
  name: string;
  code: string;
  description: string;
  parentCategory: string;
  unit: string;
  isActive: boolean;
  businessScope: "SINGLE" | "MULTIPLE" | "ALL";
  businessIds: string[];
}

const EMPTY_FORM: FormData = {
  name: "",
  code: "",
  description: "",
  parentCategory: "",
  unit: "",
  isActive: true,
  businessScope: "SINGLE",
  businessIds: [],
};

export default function MaterialCategoriesPage() {
  const { businessId } = useActiveBusinessId();

  const [search, setSearch] = useState("");
  const [view, setView] = useState<"table" | "tree">("tree");
  const [modal, setModal] = useState<ModalState>({ type: null });
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const { data: categoriesData, isLoading: loading, mutate: fetchCategories } = useSWR(
    businessId ? `/api/material-categories?${new URLSearchParams({ businessId })}` : null
  );
  const categories: MaterialCategory[] = categoriesData?.success ? categoriesData.data ?? [] : [];

  /* ── filtered list ─────────────────────────────────── */
  const filtered = categories.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.code?.toLowerCase() ?? "").includes(q) ||
      (c.description?.toLowerCase() ?? "").includes(q)
    );
  });

  /* ── modal helpers ──────────────────────────────────── */
  const openAdd = () => {
    setFormData(EMPTY_FORM);
    setFormError("");
    setModal({ type: "add" });
  };

  const openEdit = (category: MaterialCategory) => {
    setFormData({
      name: category.name,
      code: category.code ?? "",
      description: category.description ?? "",
      parentCategory:
        typeof category.parentCategory === "object" && category.parentCategory
          ? category.parentCategory._id
          : "",
      unit: category.unit ?? "",
      isActive: category.isActive,
      businessScope: category.businessScope || "SINGLE",
      businessIds: category.businessIds || [],
    });
    setFormError("");
    setModal({ type: "edit", category });
  };

  const openDelete = (category: MaterialCategory) => {
    setDeleteConfirmName("");
    setModal({ type: "delete", category });
  };

  const closeModal = () => setModal({ type: null });

  /* ── submit add / edit ──────────────────────────────── */
  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      setFormError("Category name is required.");
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      const payload = {
        businessId,
        name: formData.name.trim(),
        code: formData.code.trim() || undefined,
        description: formData.description.trim() || undefined,
        parentCategory: formData.parentCategory || undefined,
        unit: formData.unit.trim() || undefined,
        isActive: formData.isActive,
        businessScope: formData.businessScope,
        businessIds: formData.businessIds,
      };

      let res: Response;
      if (modal.type === "add") {
        res = await fetch("/api/material-categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/material-categories/${modal.category!._id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok || !data.success) {
        setFormError(data.error ?? "Something went wrong.");
        return;
      }

      showToast(
        modal.type === "add"
          ? "Category created successfully."
          : "Category updated successfully."
      );
      closeModal();
      fetchCategories();
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── delete ─────────────────────────────────────────── */
  const handleDelete = async () => {
    if (!modal.category) return;
    if (deleteConfirmName !== modal.category.name) {
      setFormError("Category name does not match.");
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      const res = await fetch(
        `/api/material-categories/${modal.category._id}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        setFormError(data.error ?? "Failed to delete.");
        return;
      }
      showToast("Category deleted.");
      closeModal();
      fetchCategories();
    } catch {
      setFormError("Network error.");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── parent options (exclude self on edit) ────────────── */
  const parentOptions = categories.filter(
    (c) => modal.type !== "edit" || c._id !== modal.category?._id
  );

  /* ── render ─────────────────────────────────────────── */
  return (
    <div className="p-6 space-y-6 bg-bg min-h-screen">
      <PageHeader
        title="Material Categories"
        description={'Used to classify raw materials/inventory items and to group Bill of Materials entries when building a product — the Add Material and BOM forms both read their category dropdown from here. Give a category a parent to branch it (e.g. "Fabric" with "Cotton" and "Polyester" underneath).'}
        actions={<Button onClick={openAdd} icon={<Plus size={15} />}>Add Category</Button>}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-xs text-ink-3 mb-1">Total Categories</p>
          <p className="tabular text-2xl font-semibold text-ink">{categories.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-3 mb-1">Active</p>
          <p className="tabular text-2xl font-semibold text-success">
            {categories.filter((c) => c.isActive).length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-3 mb-1">Inactive</p>
          <p className="tabular text-2xl font-semibold text-ink-3">
            {categories.filter((c) => !c.isActive).length}
          </p>
        </Card>
      </div>

      {/* Search + view toggle */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, code or description…"
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 bg-surface-2 rounded-control p-1 shrink-0">
          <Button variant={view === "table" ? 'secondary' : 'ghost'} size="sm" onClick={() => setView("table")}>Table</Button>
          <Button variant={view === "tree" ? 'secondary' : 'ghost'} size="sm" onClick={() => setView("tree")}>Tree</Button>
        </div>
      </div>

      {/* Tree view -- collapsible/expandable, multi-root */}
      {filtered.length > 0 && view === "tree" && (
        <CategoryTree
          items={filtered.map((c) => ({
            ...c,
            parentId: c.parentCategory?._id ?? null,
          }))}
          onEdit={(item) => openEdit(filtered.find((c) => c._id === item._id)!)}
          onDelete={(item) => openDelete(filtered.find((c) => c._id === item._id)!)}
        />
      )}

      {/* Table */}
      {view === "tree" ? null : (
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-xs text-ink-3 font-medium">Name</th>
              <th className="px-4 py-3 text-left text-xs text-ink-3 font-medium hidden sm:table-cell">Code</th>
              <th className="px-4 py-3 text-left text-xs text-ink-3 font-medium hidden md:table-cell">Description</th>
              <th className="px-4 py-3 text-left text-xs text-ink-3 font-medium hidden lg:table-cell">Parent</th>
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
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    kind="empty"
                    title={search ? "No categories match your search" : "No material categories yet"}
                    action={!search ? <Button onClick={openAdd} icon={<Plus size={14} />}>Add First Category</Button> : undefined}
                  />
                </td>
              </tr>
            ) : (
              filtered.map((cat) => (
                <tr key={cat._id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-control bg-accent-soft flex items-center justify-center flex-shrink-0">
                        <Layers size={13} className="text-accent" />
                      </div>
                      <span className="text-ink font-medium">{cat.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    {cat.code ? (
                      <span className="text-xs tabular font-medium px-2 py-0.5 rounded-full text-ink-2 bg-surface-2">
                        {cat.code}
                      </span>
                    ) : (
                      <span className="text-ink-3 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-ink-3 text-xs line-clamp-1 max-w-xs">
                      {cat.description || <span className="text-ink-3">—</span>}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {cat.parentCategory ? (
                      <div className="flex items-center gap-1 text-xs text-ink-3">
                        <ChevronRight size={12} className="text-ink-3" />
                        {cat.parentCategory.name}
                      </div>
                    ) : (
                      <span className="text-ink-3 text-xs">Root</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={cat.isActive ? 'success' : 'neutral'}>{cat.isActive ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="secondary" size="sm" onClick={() => openEdit(cat)}>
                        <Edit2 size={12} />
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => openDelete(cat)}>
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
      )}

      {/* Row count */}
      {!loading && filtered.length > 0 && (
        <p className="text-xs text-ink-3 text-right">
          Showing {filtered.length} of {categories.length} categories
        </p>
      )}

      {/* ── Add / Edit Modal ─────────────────────────────── */}
      {(modal.type === "add" || modal.type === "edit") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-lg bg-surface border border-border rounded-card overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex justify-between items-center">
              <h2 className="h-section">
                {modal.type === "add" ? "Add Material Category" : "Edit Material Category"}
              </h2>
              <button onClick={closeModal} className="text-ink-3 hover:text-ink transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <Field label="Category Name" required>
                <Input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Raw Materials"
                />
              </Field>

              <Field label="Code">
                <Input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="e.g. RM-01"
                />
              </Field>

              <Field label="Description">
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of this category…"
                  rows={3}
                />
              </Field>

              <Field
                label="Parent Category"
                hint={parentOptions.length === 0 ? "No other categories exist yet for this business — save this one first (as a root category), then create another and pick this as its parent." : undefined}
              >
                <Select
                  value={formData.parentCategory}
                  onChange={(e) => setFormData({ ...formData, parentCategory: e.target.value })}
                >
                  <option value="">None (Root Category)</option>
                  {parentOptions.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Default Unit">
                <Input
                  type="text"
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  placeholder="e.g. kg, pcs, m"
                />
              </Field>

              {/* Active toggle */}
              <div className="flex items-center justify-between rounded-control border border-border px-4 py-3">
                <div>
                  <p className="text-sm text-ink">Active</p>
                  <p className="text-xs text-ink-3 mt-0.5">
                    Inactive categories won&apos;t appear in material forms.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    formData.isActive ? "bg-success" : "bg-surface-3"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      formData.isActive ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <BusinessScopeControl
                value={{ businessScope: formData.businessScope, businessIds: formData.businessIds }}
                onChange={(v) => setFormData({ ...formData, ...v })}
              />

              {formError && (
                <div className="flex items-center gap-2 text-xs text-danger bg-danger-soft border border-danger/20 rounded-control px-3 py-2">
                  <AlertTriangle size={13} />
                  {formError}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <Button variant="secondary" size="sm" onClick={closeModal}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={submitting} loading={submitting}>
                {modal.type === "add" ? "Create Category" : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ─────────────────────── */}
      {modal.type === "delete" && modal.category && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-lg bg-surface border border-border rounded-card overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex justify-between items-center">
              <h2 className="h-section">Delete Category</h2>
              <button onClick={closeModal} className="text-ink-3 hover:text-ink transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="flex items-start gap-3 p-4 bg-danger-soft border border-danger/20 rounded-control">
                <AlertTriangle size={16} className="text-danger mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-ink font-medium mb-0.5">
                    This action cannot be undone
                  </p>
                  <p className="text-xs text-ink-3">
                    Deleting{" "}
                    <span className="text-ink font-medium">
                      {modal.category.name}
                    </span>{" "}
                    will remove it permanently. Materials using this category may be
                    affected.
                  </p>
                </div>
              </div>

              <Field label={<>Type <span className="text-ink font-medium">{modal.category.name}</span> to confirm</>}>
                <Input
                  type="text"
                  value={deleteConfirmName}
                  onChange={(e) => {
                    setDeleteConfirmName(e.target.value);
                    setFormError("");
                  }}
                  placeholder="Category name"
                />
              </Field>

              {formError && (
                <div className="flex items-center gap-2 text-xs text-danger bg-danger-soft border border-danger/20 rounded-control px-3 py-2">
                  <AlertTriangle size={13} />
                  {formError}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <Button variant="secondary" size="sm" onClick={closeModal}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleDelete}
                disabled={submitting || deleteConfirmName !== modal.category.name}
                loading={submitting}
              >
                Delete Category
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ─────────────────────────────────────────── */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-[60] flex items-center gap-2.5 px-4 py-3 rounded-control border text-sm shadow-card-lg transition-all ${
            toast.ok
              ? "bg-surface border-border text-ink"
              : "bg-danger-soft border-danger/20 text-danger"
          }`}
        >
          {toast.ok ? (
            <div className="w-1.5 h-1.5 rounded-full bg-success" />
          ) : (
            <AlertTriangle size={13} className="text-danger" />
          )}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
