"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  X,
  Layers,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  Package,
  FolderTree,
  ImageIcon,
  ToggleLeft,
  ToggleRight,
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

interface ProductCategory {
  _id: string;
  name: string;
  description?: string;
  parentId?: { _id: string; name: string } | null;
  imageUrl?: string;
  isActive: boolean;
  productCount: number;
  businessScope?: "SINGLE" | "MULTIPLE" | "ALL";
  businessIds?: string[];
  createdAt: string;
}

interface FormData {
  name: string;
  description: string;
  parentId: string;
  imageUrl: string;
  businessScope: "SINGLE" | "MULTIPLE" | "ALL";
  businessIds: string[];
}

type ModalType = "add" | "edit" | "delete" | null;

interface ModalState {
  type: ModalType;
  category?: ProductCategory;
}

export default function ProductCategoriesPage() {
  const { businessId, businessName } = useActiveBusinessId();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [view, setView] = useState<"table" | "tree">("tree");
  const [modal, setModal] = useState<ModalState>({ type: null });
  const [formData, setFormData] = useState<FormData>({
    name: "",
    description: "",
    parentId: "",
    imageUrl: "",
    businessScope: "SINGLE",
    businessIds: [],
  });
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const categoriesParams = businessId
    ? (() => {
        const params = new URLSearchParams({ businessId, includeInactive: "true" });
        if (debouncedSearch) params.set("search", debouncedSearch);
        return params.toString();
      })()
    : null;

  const { data: categoriesData, isLoading: loading, mutate: fetchCategories } = useSWR(
    categoriesParams ? `/api/product-categories?${categoriesParams}` : null,
    { keepPreviousData: true }
  );
  const categories: ProductCategory[] = categoriesData?.success ? categoriesData.categories : [];

  const openAdd = () => {
    setFormData({ name: "", description: "", parentId: "", imageUrl: "", businessScope: "SINGLE", businessIds: [] });
    setFormError("");
    setModal({ type: "add" });
  };

  const openEdit = (cat: ProductCategory) => {
    setFormData({
      name: cat.name,
      description: cat.description || "",
      parentId: cat.parentId?._id || "",
      imageUrl: cat.imageUrl || "",
      businessScope: cat.businessScope || "SINGLE",
      businessIds: cat.businessIds || [],
    });
    setFormError("");
    setModal({ type: "edit", category: cat });
  };

  const openDelete = (cat: ProductCategory) => {
    setDeleteConfirmName("");
    setModal({ type: "delete", category: cat });
  };

  const closeModal = () => {
    setModal({ type: null });
    setFormError("");
  };

  const handleSubmitAdd = async () => {
    if (!formData.name.trim()) {
      setFormError("Category name is required.");
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      const res = await fetch("/api/product-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          description: formData.description.trim(),
          parentId: formData.parentId || null,
          imageUrl: formData.imageUrl.trim(),
          businessId,
          businessScope: formData.businessScope,
          businessIds: formData.businessIds,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setFormError(data.error || "Failed to create category.");
        return;
      }
      showToast("Category created successfully.");
      closeModal();
      fetchCategories();
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitEdit = async () => {
    if (!formData.name.trim()) {
      setFormError("Category name is required.");
      return;
    }
    if (!modal.category) return;
    setSubmitting(true);
    setFormError("");
    try {
      const res = await fetch(`/api/product-categories/${modal.category._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          description: formData.description.trim(),
          parentId: formData.parentId || null,
          imageUrl: formData.imageUrl.trim(),
          businessScope: formData.businessScope,
          businessIds: formData.businessIds,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setFormError(data.error || "Failed to update category.");
        return;
      }
      showToast("Category updated successfully.");
      closeModal();
      fetchCategories();
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!modal.category) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/product-categories/${modal.category._id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || "Failed to delete category.", false);
        closeModal();
        return;
      }
      showToast("Category deleted.");
      closeModal();
      fetchCategories();
    } catch {
      showToast("Network error.", false);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (cat: ProductCategory) => {
    try {
      const res = await fetch(`/api/product-categories/${cat._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !cat.isActive }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Category ${!cat.isActive ? "activated" : "deactivated"}.`);
        fetchCategories();
      }
    } catch {
      showToast("Failed to update status.", false);
    }
  };

  const totalCount = categories.length;
  const activeCount = categories.filter((c) => c.isActive).length;
  const rootCount = categories.filter((c) => !c.parentId).length;

  // Categories available as parent options (exclude current editing category)
  const parentOptions = categories.filter(
    (c) => modal.category ? c._id !== modal.category._id : true
  );

  return (
    <div className="p-6 space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[100] flex items-center gap-2 px-4 py-3 rounded-control text-sm font-medium shadow-card-lg transition-all ${
            toast.ok
              ? "bg-success-soft border border-success/20 text-success"
              : "bg-danger-soft border border-danger/20 text-danger"
          }`}
        >
          {toast.ok ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <PageHeader
        title="Product Categories"
        description={
          <>
            {businessName && (
              <span className="block text-xs font-medium text-accent mb-1">
                Editing categories for: {businessName}
              </span>
            )}
            Powers the category dropdown on every product form (admin and vendor product
            creation) and the storefront/mobile app&apos;s category browsing and filters. Branch
            categories with a parent — e.g. &quot;Mobiles&quot; as the root, &quot;Smartphones&quot; and
            &quot;Feature Phones&quot; underneath it.
          </>
        }
        actions={
          <Button onClick={openAdd} icon={<Plus size={16} />}>
            Add Category
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-ink-2 text-xs mb-2">
            <Layers size={14} />
            Total Categories
          </div>
          <p className="text-2xl font-semibold text-ink">{totalCount}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-ink-2 text-xs mb-2">
            <CheckCircle size={14} />
            Active
          </div>
          <p className="text-2xl font-semibold text-success">{activeCount}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-ink-2 text-xs mb-2">
            <FolderTree size={14} />
            Root Categories
          </div>
          <p className="text-2xl font-semibold text-accent">{rootCount}</p>
        </Card>
      </div>

      {/* Search + view toggle */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-sm flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search categories…"
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 bg-surface-2 rounded-control p-1 shrink-0">
          <button
            onClick={() => setView("table")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${view === "table" ? "bg-surface text-ink shadow-card" : "text-ink-3"}`}
          >
            Table
          </button>
          <button
            onClick={() => setView("tree")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${view === "tree" ? "bg-surface text-ink shadow-card" : "text-ink-3"}`}
          >
            Tree
          </button>
        </div>
      </div>

      {/* Tree view -- collapsible/expandable, multi-root */}
      {!loading && categories.length > 0 && view === "tree" && (
        <CategoryTree
          items={categories.map((c) => ({
            ...c,
            parentId: typeof c.parentId === "object" ? c.parentId?._id ?? null : c.parentId ?? null,
          }))}
          onEdit={(item) => openEdit(categories.find((c) => c._id === item._id)!)}
          onDelete={(item) => openDelete(categories.find((c) => c._id === item._id)!)}
        />
      )}

      {/* Table */}
      {view === "tree" ? null : loading ? (
        <div className="p-12 text-center text-ink-3">Loading…</div>
      ) : categories.length === 0 ? (
        <EmptyState
          kind={search ? "search" : "empty"}
          title="No categories found"
          description={
            search
              ? "Try a different search term."
              : "Get started by adding your first product category."
          }
          action={
            !search && (
              <Button onClick={openAdd} icon={<Plus size={16} />}>
                Add Category
              </Button>
            )
          }
        />
      ) : (
        <div className="rounded-card border border-border overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-border bg-surface">
              <tr>
                <th className="px-4 py-3 text-left text-xs text-ink-2 font-medium">
                  Category
                </th>
                <th className="px-4 py-3 text-left text-xs text-ink-2 font-medium">
                  Parent
                </th>
                <th className="px-4 py-3 text-left text-xs text-ink-2 font-medium">
                  Products
                </th>
                <th className="px-4 py-3 text-left text-xs text-ink-2 font-medium">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs text-ink-2 font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {categories.map((cat) => (
                <tr
                  key={cat._id}
                  className="hover:bg-surface-2 transition-colors"
                >
                  {/* Name + image + description */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-control border border-border bg-surface flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {cat.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={cat.imageUrl}
                            alt={cat.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display =
                                "none";
                            }}
                          />
                        ) : (
                          <ImageIcon size={14} className="text-ink-3" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-ink">
                          {cat.name}
                        </p>
                        {cat.description && (
                          <p className="text-xs text-ink-3 mt-0.5 max-w-xs truncate">
                            {cat.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Parent */}
                  <td className="px-4 py-3">
                    {cat.parentId ? (
                      <div className="flex items-center gap-1.5 text-xs text-ink-2">
                        <ChevronRight size={12} className="text-ink-3" />
                        {cat.parentId.name}
                      </div>
                    ) : (
                      <Badge tone="neutral">Root</Badge>
                    )}
                  </td>

                  {/* Product count */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Package size={12} className="text-ink-3" />
                      <Badge tone={cat.productCount > 0 ? "info" : "neutral"}>
                        {cat.productCount}
                      </Badge>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(cat)}
                      className="flex items-center gap-1.5 group"
                      title={cat.isActive ? "Click to deactivate" : "Click to activate"}
                    >
                      {cat.isActive ? (
                        <>
                          <ToggleRight
                            size={18}
                            className="text-success group-hover:opacity-80"
                          />
                          <Badge tone="success">Active</Badge>
                        </>
                      ) : (
                        <>
                          <ToggleLeft
                            size={18}
                            className="text-ink-3 group-hover:opacity-80"
                          />
                          <Badge tone="neutral">Inactive</Badge>
                        </>
                      )}
                    </button>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        onClick={() => openEdit(cat)}
                        variant="secondary"
                        size="sm"
                        className="px-3 py-2"
                      >
                        <Edit2 size={12} />
                      </Button>
                      <Button
                        onClick={() => openDelete(cat)}
                        variant="danger"
                        size="sm"
                        className="px-3 py-2"
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      {(modal.type === "add" || modal.type === "edit") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-lg bg-surface border border-border rounded-card overflow-hidden">
            {/* Modal header */}
            <div className="px-6 py-4 border-b border-border flex justify-between items-center">
              <h2 className="text-base font-semibold text-ink">
                {modal.type === "add" ? "Add Category" : "Edit Category"}
              </h2>
              <button
                onClick={closeModal}
                className="text-ink-3 hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-4">
              {/* Name */}
              <Field label="Category Name" required>
                <Input
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="e.g. Electronics, Apparel…"
                />
              </Field>

              {/* Description */}
              <Field label="Description">
                <Textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder="Brief description of this category…"
                  rows={3}
                />
              </Field>

              {/* Parent Category */}
              <Field label="Parent Category" hint="Leave empty to create a root-level category.">
                <Select
                  value={formData.parentId}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, parentId: e.target.value }))
                  }
                >
                  <option value="">— None (Root Category) —</option>
                  {parentOptions.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.parentId ? `↳ ${c.name}` : c.name}
                    </option>
                  ))}
                </Select>
              </Field>

              {/* Image URL */}
              <Field label="Image URL">
                <Input
                  value={formData.imageUrl}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, imageUrl: e.target.value }))
                  }
                  placeholder="https://example.com/image.png"
                />
                {formData.imageUrl && (
                  <div className="mt-2 flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={formData.imageUrl}
                      alt="Preview"
                      className="w-12 h-12 rounded-control object-cover border border-border"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display =
                          "none";
                      }}
                    />
                    <p className="text-xs text-ink-3">Image preview</p>
                  </div>
                )}
              </Field>

              <BusinessScopeControl
                value={{ businessScope: formData.businessScope, businessIds: formData.businessIds }}
                onChange={(v) => setFormData((p) => ({ ...p, ...v }))}
              />

              {/* Error */}
              {formError && (
                <div className="flex items-center gap-2 text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-3 py-2">
                  <AlertCircle size={14} />
                  {formError}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <Button onClick={closeModal} variant="secondary">
                Cancel
              </Button>
              <Button
                onClick={
                  modal.type === "add" ? handleSubmitAdd : handleSubmitEdit
                }
                disabled={submitting}
                icon={modal.type === "add" ? <Plus size={14} /> : <CheckCircle size={14} />}
              >
                {submitting
                  ? "Saving…"
                  : modal.type === "add"
                    ? "Create Category"
                    : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {modal.type === "delete" && modal.category && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-lg bg-surface border border-border rounded-card overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex justify-between items-center">
              <h2 className="text-base font-semibold text-ink">
                Delete Category
              </h2>
              <button
                onClick={closeModal}
                className="text-ink-3 hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-start gap-3 p-4 bg-danger-soft border border-danger/20 rounded-control">
                <AlertCircle
                  size={18}
                  className="text-danger flex-shrink-0 mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-ink">
                    Delete &quot;{modal.category.name}&quot;?
                  </p>
                  <p className="text-xs text-ink-3 mt-1">
                    This action cannot be undone. Any sub-categories will be
                    promoted to root level. Products using this category will
                    retain their category label.
                  </p>
                  {modal.category.productCount > 0 && (
                    <p className="text-xs text-warning mt-2">
                      Warning: {modal.category.productCount} product
                      {modal.category.productCount !== 1 ? "s" : ""} currently
                      assigned to this category.
                    </p>
                  )}
                </div>
              </div>
              <Field
                label={<>Type <span className="font-mono text-ink-2">{modal.category.name}</span> to confirm</>}
              >
                <Input
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  placeholder={modal.category.name}
                />
              </Field>
            </div>
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <Button onClick={closeModal} variant="secondary">
                Cancel
              </Button>
              <Button
                onClick={handleDelete}
                variant="danger"
                disabled={
                  submitting ||
                  deleteConfirmName !== modal.category.name
                }
              >
                {submitting ? "Deleting…" : "Delete Category"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
