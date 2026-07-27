"use client";

import { useState, useEffect, useMemo } from "react";
import useSWR from "swr";
import {
  Search,
  Plus,
  Tag,
  Edit2,
  Trash2,
  X,
  ImageOff,
  Package,
  CheckCircle,
  AlertCircle,
  Layers,
  Layers3,
  FolderTree,
  Smartphone,
  Download,
  Upload,
} from "lucide-react";
import { useActiveBusinessId } from "@/hooks/useActiveBusinessId";
import BusinessScopeControl, { type BusinessScopeValue } from "@/components/catalog/BusinessScopeControl";
import { CategoryTree } from "@/components/shared/CategoryTree";
import { DEVICE_CATEGORIES, DEVICE_CATEGORY_LABELS, type DeviceCategory } from "@/core/catalog/deviceCategory";
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'
import { LoadingPanel } from '@/components/ui/Spinner'

interface Brand {
  _id: string;
  name: string;
  description?: string;
  logoUrl?: string;
  isActive: boolean;
  parentId?: string | null;
  category?: DeviceCategory | null;
  productCategoryId?: string | null;
  businessScope?: "SINGLE" | "MULTIPLE" | "ALL";
  businessIds?: string[];
  createdAt: string;
  updatedAt: string;
}

interface ProductCategoryOption {
  _id: string;
  name: string;
  parentId?: { _id: string; name: string } | null;
}

interface SeriesOption {
  _id: string;
  name: string;
  brandId: string;
  isActive: boolean;
}

interface ModelOption {
  _id: string;
  name: string;
  brandId: string;
  seriesId?: string | null;
  isActive: boolean;
}

interface VariantOption {
  _id: string;
  name: string;
  modelId: string;
  isActive: boolean;
}

// Synthetic tree row used only for the Tree view -- Category, Series and
// Model don't natively have a "parentId" pointing at a Brand's own tree
// slot, so these are given prefixed synthetic ids/parentIds
// ("cat:"/"series:"/"model:") purely so CategoryTree (which only
// understands one flat parentId-linked list) can render the full
// Category -> Brand -> Series -> Model hierarchy without being rewritten.
// "kind" drives which icon/actions render for each row (see renderIcon/
// renderActions below) -- a Category row is a device-type grouping only
// (no edit/delete), a Brand row keeps the existing modal-based edit/
// delete, Series/Model rows get their own inline rename+delete against
// their own APIs.
interface TreeRow {
  _id: string;
  name: string;
  parentId?: string | null;
  isActive?: boolean;
  kind: "category" | "brand" | "series" | "model" | "variant";
}

const CATEGORY_NODE_PREFIX = "cat:";
const SERIES_NODE_PREFIX = "series:";
const MODEL_NODE_PREFIX = "model:";
const VARIANT_NODE_PREFIX = "variant:";

interface ModalState {
  type: "add" | "edit" | "delete" | null;
  brand?: Brand;
}

interface SeriesModalState {
  open: boolean;
  brandId: string;
  brandName: string;
}

interface ModelModalState {
  open: boolean;
  mode: "add" | "edit";
  brandId: string;
  brandName: string;
  seriesId: string; // "" = no series (direct under brand)
  model?: ModelOption;
}

interface VariantModalState {
  open: boolean;
  mode: "add" | "edit";
  modelId: string;
  modelName: string;
  variant?: VariantOption;
}

export default function BrandsPage() {
  const { businessId } = useActiveBusinessId();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [view, setView] = useState<"table" | "tree">("table");
  const [categoryFilter, setCategoryFilter] = useState<DeviceCategory | "">("");
  const [modal, setModal] = useState<ModalState>({ type: null });
  const [seriesModal, setSeriesModal] = useState<SeriesModalState | null>(null);
  const [modelModal, setModelModal] = useState<ModelModalState | null>(null);
  const [variantModal, setVariantModal] = useState<VariantModalState | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    logoUrl: "",
    parentId: "",
    category: "" as DeviceCategory | "",
    productCategoryId: "",
    businessScope: "SINGLE" as "SINGLE" | "MULTIPLE" | "ALL",
    businessIds: [] as string[],
  });
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [deduping, setDeduping] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<Array<{ row: number; status: string; error?: string }> | null>(null);
  const [uploadSummary, setUploadSummary] = useState<{ total: number; created: number; skipped: number; failed: number } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const brandsParams = businessId
    ? (() => {
        const params = new URLSearchParams({ businessId, includeInactive: "true" });
        if (debouncedSearch) params.set("search", debouncedSearch);
        if (categoryFilter) params.set("category", categoryFilter);
        return params.toString();
      })()
    : null;

  const { data: brandsRes, isLoading: loading, mutate: fetchBrands } = useSWR(
    brandsParams ? `/api/brands?${brandsParams}` : null,
    { keepPreviousData: true }
  );
  const brands: Brand[] = brandsRes?.success ? brandsRes.brands ?? [] : [];

  const { data: productCategoriesRes } = useSWR(
    businessId ? `/api/product-categories?businessId=${businessId}&includeInactive=true` : null
  );
  const productCategories: ProductCategoryOption[] = productCategoriesRes?.success ? productCategoriesRes.categories ?? [] : [];

  // Both Table and Tree views need the full Series and DeviceModel lists
  // (not just Brands), fetched once per business, unfiltered by brand, and
  // nested/grouped client-side below.
  const { data: seriesRes, mutate: refetchSeries } = useSWR(
    businessId ? `/api/series?businessId=${businessId}&includeInactive=true` : null
  );
  const seriesOptions: SeriesOption[] = seriesRes?.success ? seriesRes.series ?? [] : [];

  const { data: modelsRes, mutate: refetchModels } = useSWR(
    businessId ? `/api/device-models?businessId=${businessId}` : null
  );
  const modelOptions: ModelOption[] = modelsRes?.success ? modelsRes.models ?? [] : [];

  const { data: variantsRes, mutate: refetchVariants } = useSWR(
    businessId ? `/api/variants?businessId=${businessId}&includeInactive=true` : null
  );
  const variantOptions: VariantOption[] = variantsRes?.success ? variantsRes.variants ?? [] : [];

  // Only device types that actually have a top-level (non-sub-branded)
  // brand under them get a Category row in the Tree view -- otherwise
  // every one of the 47 device types would show up as a permanently-empty
  // folder there, which is just noise for a business that only sells a
  // handful of them. The Table view below intentionally does the opposite
  // (always shows every category) so admins can add the very first brand
  // into any category without hunting.
  const usedCategories = new Set(brands.filter((b) => !b.parentId && b.category).map((b) => b.category as DeviceCategory));

  // Category -> Brand -> Series -> Model, all in one flat parentId-linked
  // list CategoryTree can nest: Category rows are synthetic (device-type
  // grouping only, no underlying document), Brand rows nest under their
  // Category (or their parent Brand, for sub-branded lines), Series rows
  // nest under their Brand, Model rows nest under their Series (or, if the
  // model has no seriesId, directly under its Brand).
  const treeRows: TreeRow[] = [
    ...DEVICE_CATEGORIES.filter((c) => usedCategories.has(c)).map((c): TreeRow => ({
      _id: `${CATEGORY_NODE_PREFIX}${c}`,
      name: DEVICE_CATEGORY_LABELS[c],
      parentId: null,
      kind: "category",
    })),
    ...brands.map((b): TreeRow => ({
      _id: b._id,
      name: b.name,
      parentId: b.parentId || (b.category ? `${CATEGORY_NODE_PREFIX}${b.category}` : null),
      isActive: b.isActive,
      kind: "brand",
    })),
    ...seriesOptions.map((s): TreeRow => ({
      _id: `${SERIES_NODE_PREFIX}${s._id}`,
      name: s.name,
      parentId: s.brandId,
      isActive: s.isActive,
      kind: "series",
    })),
    ...modelOptions.map((m): TreeRow => ({
      _id: `${MODEL_NODE_PREFIX}${m._id}`,
      name: m.name,
      // Series is optional now -- a model with no seriesId attaches
      // directly under its Brand instead of a Series node.
      parentId: m.seriesId ? `${SERIES_NODE_PREFIX}${m.seriesId}` : m.brandId,
      isActive: m.isActive,
      kind: "model",
    })),
    ...variantOptions.map((v): TreeRow => ({
      _id: `${VARIANT_NODE_PREFIX}${v._id}`,
      name: v.name,
      parentId: `${MODEL_NODE_PREFIX}${v.modelId}`,
      isActive: v.isActive,
      kind: "variant",
    })),
  ];

  const refreshSeriesAndModels = () => {
    if (!businessId) return;
    refetchSeries();
    refetchModels();
    refetchVariants();
  };

  const renameSeries = async (row: TreeRow | SeriesOption) => {
    const id = "kind" in row ? row._id.slice(SERIES_NODE_PREFIX.length) : row._id;
    const name = window.prompt("Rename series", row.name);
    if (!name || !name.trim() || name.trim() === row.name) return;
    const res = await fetch(`/api/series/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      showToast(data.error || "Failed to rename series.", false);
      return;
    }
    showToast("Series renamed.");
    refreshSeriesAndModels();
  };

  const deleteSeries = async (row: TreeRow | SeriesOption) => {
    const id = "kind" in row ? row._id.slice(SERIES_NODE_PREFIX.length) : row._id;
    if (!window.confirm(`Delete series "${row.name}"? Models under it will need to be reassigned.`)) return;
    const res = await fetch(`/api/series/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok || !data.success) {
      showToast(data.error || "Failed to delete series.", false);
      return;
    }
    showToast("Series deleted.");
    refreshSeriesAndModels();
  };

  const renameModel = async (row: TreeRow | ModelOption) => {
    const id = "kind" in row ? row._id.slice(MODEL_NODE_PREFIX.length) : row._id;
    const name = window.prompt("Rename model", row.name);
    if (!name || !name.trim() || name.trim() === row.name) return;
    const res = await fetch(`/api/device-models/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      showToast(data.error || "Failed to rename model.", false);
      return;
    }
    showToast("Model renamed.");
    refreshSeriesAndModels();
  };

  const deleteModel = async (row: TreeRow | ModelOption) => {
    if (!window.confirm(`Delete model "${row.name}"?`)) return;
    const id = "kind" in row ? row._id.slice(MODEL_NODE_PREFIX.length) : row._id;
    const res = await fetch(`/api/device-models/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok || !data.success) {
      showToast(data.error || "Failed to delete model.", false);
      return;
    }
    showToast("Model deleted.");
    refreshSeriesAndModels();
  };

  const renameVariant = async (row: TreeRow | VariantOption) => {
    const id = "kind" in row ? row._id.slice(VARIANT_NODE_PREFIX.length) : row._id;
    const name = window.prompt("Rename variant", row.name);
    if (!name || !name.trim() || name.trim() === row.name) return;
    const res = await fetch(`/api/variants/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      showToast(data.error || "Failed to rename variant.", false);
      return;
    }
    showToast("Variant renamed.");
    refreshSeriesAndModels();
  };

  const deleteVariant = async (row: TreeRow | VariantOption) => {
    const id = "kind" in row ? row._id.slice(VARIANT_NODE_PREFIX.length) : row._id;
    if (!window.confirm(`Delete variant "${row.name}"?`)) return;
    const res = await fetch(`/api/variants/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok || !data.success) {
      showToast(data.error || "Failed to delete variant.", false);
      return;
    }
    showToast("Variant deleted.");
    refreshSeriesAndModels();
  };

  // One-click fix for catalog data that predates the Series level (models
  // with no seriesId that an admin would rather see grouped under a named
  // Series) -- see /api/series/backfill's own header comment. Series is no
  // longer mandatory, so this is offered as a convenience, not a repair.
  const runBackfill = async () => {
    if (!businessId) return;
    setBackfilling(true);
    try {
      const res = await fetch(`/api/series/backfill?businessId=${businessId}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || "Backfill failed.", false);
        return;
      }
      const { seriesCreated, modelsBackfilled } = data.summary;
      showToast(
        seriesCreated === 0 && modelsBackfilled === 0
          ? "Nothing to group -- every model already has a Series or is intentionally direct."
          : `Created ${seriesCreated} Series, linked ${modelsBackfilled} models.`
      );
      refreshSeriesAndModels();
    } catch {
      showToast("Network error.", false);
    } finally {
      setBackfilling(false);
    }
  };

  // Populates the curated Indian-market starter catalog (all categories --
  // see src/core/catalog/seedCatalogData.ts) for the active business, from
  // the browser, using the server's own DB connection -- no local script /
  // .env.local access needed. Idempotent: safe to click more than once.
  const runSeedCatalog = async () => {
    if (!businessId) return;
    if (!window.confirm("Add the curated starter catalog (brands, series, models across all categories) for this business? This only adds what's missing -- existing data is never overwritten or removed.")) {
      return;
    }
    setSeeding(true);
    try {
      const res = await fetch(`/api/admin/seed-catalog?businessId=${businessId}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || "Seeding failed.", false);
        return;
      }
      const { brandsCreated, brandsBackfilled, seriesCreated, modelsCreated } = data.summary;
      showToast(
        brandsCreated === 0 && brandsBackfilled === 0 && seriesCreated === 0 && modelsCreated === 0
          ? "Already seeded -- nothing new to add."
          : `Added ${brandsCreated} brands, ${seriesCreated} series, ${modelsCreated} models.`
      );
      fetchBrands();
      refreshSeriesAndModels();
    } catch {
      showToast("Network error.", false);
    } finally {
      setSeeding(false);
    }
  };

  // Removes duplicate Brand/Series/DeviceModel docs (same name within the
  // same scope), keeping the oldest as survivor and reassigning children --
  // see /api/admin/catalog/dedupe's own header comment for the merge logic.
  const runDedupe = async () => {
    if (!businessId) return;
    if (!window.confirm("Merge duplicate Brands/Series/Models for this business? Duplicates (same name, case-insensitive) will be combined into the oldest entry, and everything under them reassigned. This cannot be undone.")) {
      return;
    }
    setDeduping(true);
    try {
      const res = await fetch(`/api/admin/catalog/dedupe?businessId=${businessId}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || "Dedupe failed.", false);
        return;
      }
      const { brandsMerged, seriesMerged, modelsMerged } = data.summary;
      showToast(
        brandsMerged === 0 && seriesMerged === 0 && modelsMerged === 0
          ? "No duplicates found."
          : `Merged ${brandsMerged} brands, ${seriesMerged} series, ${modelsMerged} models.`
      );
      fetchBrands();
      refreshSeriesAndModels();
    } catch {
      showToast("Network error.", false);
    } finally {
      setDeduping(false);
    }
  };

  // Client-side download of the CSV column headers + example rows an admin
  // can fill in and hand to Bulk Upload -- same Blob+anchor pattern used by
  // src/app/vendor/service-bom/page.tsx's downloadTemplate().
  const downloadTemplate = () => {
    const header = ["category", "brand", "series", "model", "variant"];
    const examples = [
      ["Mobile Phones", "Samsung", "Galaxy S", "Galaxy S21", "8GB RAM + 128GB Storage, Phantom Black"],
      ["Mobile Phones", "Nokia", "", "Nokia 3310", ""],
      ["Television", "LG", "", "43 Inch 4K Smart TV", "43UQ7500"],
    ];
    const csv = [header, ...examples].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "catalog-bulk-upload-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkUpload = async (file: File) => {
    if (!businessId) return;
    setUploading(true);
    setUploadResults(null);
    setUploadSummary(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/admin/catalog/bulk-upload?businessId=${businessId}`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || "Bulk upload failed.", false);
        return;
      }
      setUploadResults(data.results || []);
      setUploadSummary(data.summary || null);
      fetchBrands();
      refreshSeriesAndModels();
    } catch {
      showToast("Network error.", false);
    } finally {
      setUploading(false);
    }
  };

  // ---- Variant modal (create only -- rename/delete reuse the existing
  // prompt/confirm flows above, wired into both Table and Tree views) ----
  const openAddVariant = (model: { _id: string; name: string }) => {
    setVariantModal({ open: true, mode: "add", modelId: model._id, modelName: model.name });
  };
  const closeVariantModal = () => setVariantModal(null);
  const submitVariantModal = async (name: string) => {
    if (!variantModal || !name.trim() || !businessId) return;
    const res = await fetch("/api/variants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), modelId: variantModal.modelId, businessId }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      showToast(data.error || "Failed to create variant.", false);
      return;
    }
    showToast("Variant created.");
    closeVariantModal();
    refreshSeriesAndModels();
  };

  const openAdd = (category?: DeviceCategory) => {
    setFormData({ name: "", description: "", logoUrl: "", parentId: "", category: category || "", productCategoryId: "", businessScope: "SINGLE", businessIds: [] });
    setFormError("");
    setModal({ type: "add" });
  };

  const openEdit = (brand: Brand) => {
    setFormData({
      name: brand.name,
      description: brand.description || "",
      logoUrl: brand.logoUrl || "",
      parentId: brand.parentId || "",
      category: brand.category || "",
      productCategoryId: brand.productCategoryId || "",
      businessScope: brand.businessScope || "SINGLE",
      businessIds: brand.businessIds || [],
    });
    setFormError("");
    setModal({ type: "edit", brand });
  };

  const openDelete = (brand: Brand) => {
    setDeleteConfirmName("");
    setModal({ type: "delete", brand });
  };

  const closeModal = () => {
    setModal({ type: null });
    setFormError("");
  };

  const handleSubmitAdd = async () => {
    if (!formData.name.trim()) {
      setFormError("Brand name is required.");
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      const res = await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          description: formData.description.trim(),
          logoUrl: formData.logoUrl.trim(),
          parentId: formData.parentId || undefined,
          category: formData.category || undefined,
          productCategoryId: formData.productCategoryId || undefined,
          businessId,
          businessScope: formData.businessScope,
          businessIds: formData.businessIds,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setFormError(data.error || "Failed to create brand.");
        return;
      }
      showToast("Brand created successfully.");
      closeModal();
      fetchBrands();
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitEdit = async () => {
    if (!formData.name.trim()) {
      setFormError("Brand name is required.");
      return;
    }
    if (!modal.brand) return;
    setSubmitting(true);
    setFormError("");
    try {
      const res = await fetch(`/api/brands/${modal.brand._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          description: formData.description.trim(),
          logoUrl: formData.logoUrl.trim(),
          parentId: formData.parentId || null,
          category: formData.category || null,
          productCategoryId: formData.productCategoryId || null,
          businessScope: formData.businessScope,
          businessIds: formData.businessIds,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setFormError(data.error || "Failed to update brand.");
        return;
      }
      showToast("Brand updated successfully.");
      closeModal();
      fetchBrands();
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!modal.brand) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/brands/${modal.brand._id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || "Failed to delete brand.", false);
        closeModal();
        return;
      }
      showToast("Brand deleted.");
      closeModal();
      fetchBrands();
    } catch {
      showToast("Network error.", false);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (brand: Brand) => {
    try {
      const res = await fetch(`/api/brands/${brand._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !brand.isActive }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Brand ${!brand.isActive ? "activated" : "deactivated"}.`);
        fetchBrands();
      }
    } catch {
      showToast("Failed to update status.", false);
    }
  };

  // ---- Series modal (create only -- rename/delete reuse the existing
  // prompt/confirm flows above, wired into both Table and Tree views) ----
  const openAddSeries = (brand: { _id: string; name: string }) => {
    setSeriesModal({ open: true, brandId: brand._id, brandName: brand.name });
  };
  const closeSeriesModal = () => setSeriesModal(null);
  const submitSeriesModal = async (name: string) => {
    if (!seriesModal || !name.trim() || !businessId) return;
    const res = await fetch("/api/series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), brandId: seriesModal.brandId, businessId }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      showToast(data.error || "Failed to create series.", false);
      return;
    }
    showToast("Series created.");
    closeSeriesModal();
    refreshSeriesAndModels();
  };

  // ---- Model modal (create + edit -- reuses same POST/PUT device-models
  // endpoints the old Models page used, now with optional seriesId) ----
  const openAddModel = (brand: { _id: string; name: string }, seriesId = "") => {
    setModelModal({ open: true, mode: "add", brandId: brand._id, brandName: brand.name, seriesId });
  };
  const openEditModel = (brand: { _id: string; name: string }, model: ModelOption) => {
    setModelModal({ open: true, mode: "edit", brandId: brand._id, brandName: brand.name, seriesId: model.seriesId || "", model });
  };
  const closeModelModal = () => setModelModal(null);
  const submitModelModal = async (name: string, seriesId: string, isActive: boolean) => {
    if (!modelModal || !name.trim() || !businessId) return;
    const isEdit = modelModal.mode === "edit" && modelModal.model;
    const url = isEdit ? `/api/device-models/${modelModal.model!._id}` : "/api/device-models";
    const method = isEdit ? "PUT" : "POST";
    const body = isEdit
      ? { name: name.trim(), seriesId: seriesId || null, isActive }
      : { name: name.trim(), brandId: modelModal.brandId, seriesId: seriesId || null, businessId };
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      showToast(data.error || `Failed to ${isEdit ? "update" : "create"} model.`, false);
      return;
    }
    showToast(isEdit ? "Model updated." : "Model created.");
    closeModelModal();
    refreshSeriesAndModels();
  };

  const activeBrands = brands.filter((b) => b.isActive);
  const inactiveBrands = brands.filter((b) => !b.isActive);

  return (
    <div className="p-6 space-y-6 bg-bg min-h-screen">
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

      <PageHeader
        title="Brands & Models"
        description={"The single catalog manager: every Device Category, the Brands under it, each Brand's optional Series (product lines), and every Model/Variant. Category is a fixed, platform-wide picklist -- pick it while adding a Brand below, there's no separate \"Add Category\" step. Series is optional: if a brand has no meaningful product line, add its Models directly to the brand with no Series at all."}
        actions={<Button onClick={() => openAdd()} icon={<Plus size={16} />}>Add Brand</Button>}
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-ink-3 text-xs mb-2">
            <Layers size={14} />
            Total Brands
          </div>
          <p className="tabular text-2xl font-semibold text-ink">{brands.length}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-ink-3 text-xs mb-2">
            <CheckCircle size={14} />
            Active
          </div>
          <p className="tabular text-2xl font-semibold text-success">{activeBrands.length}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-ink-3 text-xs mb-2">
            <Package size={14} />
            Inactive
          </div>
          <p className="tabular text-2xl font-semibold text-ink-3">{inactiveBrands.length}</p>
        </Card>
      </div>

      {/* Device Category filter */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setCategoryFilter("")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
            categoryFilter === "" ? "bg-accent text-white border-accent" : "border-border text-ink-3 hover:border-border-strong"
          }`}
        >
          All Categories
        </button>
        {DEVICE_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategoryFilter(c)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
              categoryFilter === c ? "bg-accent text-white border-accent" : "border-border text-ink-3 hover:border-border-strong"
            }`}
          >
            {DEVICE_CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      {/* Search + view toggle */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative max-w-sm flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search category, brand, series or model…"
            className="pl-9"
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={runSeedCatalog}
          disabled={seeding}
          title="Add the curated Indian-market starter catalog (brands, series, models across all categories) -- only adds what's missing, never overwrites existing data"
        >
          {seeding ? "Seeding…" : "Seed Standard Catalog"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={runDedupe}
          disabled={deduping}
          title="Merge duplicate Brands/Series/Models (same name) for this business -- keeps the oldest entry and reassigns everything under the duplicates"
        >
          {deduping ? "Merging…" : "Remove Duplicates"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<Download size={12} />}
          onClick={downloadTemplate}
          title="Download a CSV template for bulk-uploading the catalog (category,brand,series,model,variant)"
        >
          Download Template
        </Button>
        <label
          title="Bulk upload a catalog CSV (category,brand,series,model,variant) -- auto-creates whatever doesn't already exist"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-control border border-border text-xs font-medium text-ink-2 hover:border-border-strong hover:text-ink shrink-0 cursor-pointer ${uploading ? "opacity-50 pointer-events-none" : ""}`}
        >
          <Upload size={12} /> {uploading ? "Uploading…" : "Bulk Upload"}
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleBulkUpload(file);
              e.target.value = "";
            }}
          />
        </label>
        {view === "tree" && (
          <Button
            variant="secondary"
            size="sm"
            onClick={runBackfill}
            disabled={backfilling}
            title="Group any model that has no Series yet under a newly created 'General' Series -- Series is optional, so this is a convenience, not a requirement"
          >
            {backfilling ? "Fixing…" : "Group Unassigned Models"}
          </Button>
        )}
        <div className="flex gap-1 bg-surface-2 rounded-control p-1 shrink-0">
          <Button variant={view === "table" ? 'secondary' : 'ghost'} size="sm" onClick={() => setView("table")}>Table</Button>
          <Button variant={view === "tree" ? 'secondary' : 'ghost'} size="sm" onClick={() => setView("tree")}>Tree</Button>
        </div>
      </div>

      {/* Bulk upload results summary */}
      {uploadSummary && (
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink-2">
              Bulk upload: <span className="font-medium text-success">{uploadSummary.created} created</span>
              {" · "}
              <span className="text-ink-3">{uploadSummary.skipped} already existed</span>
              {uploadSummary.failed > 0 && <span className="text-danger"> · {uploadSummary.failed} failed</span>}
              {" "}of {uploadSummary.total} rows.
            </p>
            <button onClick={() => { setUploadSummary(null); setUploadResults(null); }} className="text-xs text-ink-3 hover:text-ink">
              Dismiss
            </button>
          </div>
          {uploadResults && uploadResults.some((r) => r.status === "failed") && (
            <div className="max-h-48 overflow-y-auto border border-border rounded-control">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-surface-2 text-left text-ink-3">
                    <th className="px-3 py-1.5">Row</th>
                    <th className="px-3 py-1.5">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {uploadResults.filter((r) => r.status === "failed").map((r) => (
                    <tr key={r.row}>
                      <td className="px-3 py-1.5">{r.row}</td>
                      <td className="px-3 py-1.5 text-danger">{r.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Table view -- one row per leaf Model, grouped by Category > Brand >
          Series, with every category (even empty ones) always shown as its
          own section so admins can add the first Brand anywhere without
          hunting. */}
      {view === "table" && (
        <CatalogTable
          brands={brands}
          seriesOptions={seriesOptions}
          modelOptions={modelOptions}
          variantOptions={variantOptions}
          categoryFilter={categoryFilter}
          search={search}
          loading={loading}
          onAddBrand={openAdd}
          onEditBrand={openEdit}
          onDeleteBrand={openDelete}
          onAddSeries={openAddSeries}
          onRenameSeries={renameSeries}
          onDeleteSeries={deleteSeries}
          onAddModel={openAddModel}
          onEditModel={openEditModel}
          onDeleteModel={deleteModel}
          onAddVariant={openAddVariant}
          onRenameVariant={renameVariant}
          onDeleteVariant={deleteVariant}
        />
      )}

      {/* Tree view -- collapsible/expandable, multi-root, full
          Category -> Brand -> Series -> Model hierarchy. Each row kind
          gets its own icon and its own actions: Category rows are a
          grouping only (no actions), Brand rows keep the existing
          modal-based edit/delete, Series/Model rows rename/delete inline
          against their own APIs. */}
      {!loading && brands.length > 0 && view === "tree" && (
        <CategoryTree
          items={treeRows}
          defaultOpenDepth={1}
          onEdit={(item) => {
            const brand = brands.find((b) => b._id === item._id);
            if (brand) openEdit(brand);
          }}
          onDelete={(item) => {
            const brand = brands.find((b) => b._id === item._id);
            if (brand) openDelete(brand);
          }}
          renderIcon={(item) => {
            const cls = "w-3.5 h-3.5 shrink-0";
            switch (item.kind) {
              case "category":
                return <FolderTree className={`${cls} text-ink-3`} />;
              case "brand":
                return <Tag className={`${cls} text-ink-3`} />;
              case "series":
                return <Layers className={`${cls} text-info`} />;
              case "model":
                return <Smartphone className={`${cls} text-success`} />;
              case "variant":
                return <Layers3 className={`${cls} text-warning`} />;
              default:
                return null;
            }
          }}
          renderActions={(item) => {
            if (item.kind === "category") return null;
            if (item.kind === "brand") {
              const brand = brands.find((b) => b._id === item._id);
              return (
                <>
                  <button
                    onClick={() => brand && openEdit(brand)}
                    className="text-ink-3 hover:text-ink transition-colors shrink-0"
                    title="Edit brand"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => brand && openDelete(brand)}
                    className="text-ink-3 hover:text-danger transition-colors shrink-0"
                    title="Delete brand"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              );
            }
            if (item.kind === "series") {
              return (
                <>
                  <button onClick={() => renameSeries(item)} className="text-ink-3 hover:text-ink transition-colors shrink-0" title="Rename series">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => deleteSeries(item)} className="text-ink-3 hover:text-danger transition-colors shrink-0" title="Delete series">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              );
            }
            if (item.kind === "model") {
              const model = modelOptions.find((m) => `${MODEL_NODE_PREFIX}${m._id}` === item._id);
              return (
                <>
                  {model && (
                    <button onClick={() => openAddVariant(model)} className="text-ink-3 hover:text-ink transition-colors shrink-0" title="Add variant">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button onClick={() => renameModel(item)} className="text-ink-3 hover:text-ink transition-colors shrink-0" title="Rename model">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => deleteModel(item)} className="text-ink-3 hover:text-danger transition-colors shrink-0" title="Delete model">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              );
            }
            // variant
            return (
              <>
                <button onClick={() => renameVariant(item)} className="text-ink-3 hover:text-ink transition-colors shrink-0" title="Rename variant">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => deleteVariant(item)} className="text-ink-3 hover:text-danger transition-colors shrink-0" title="Delete variant">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            );
          }}
        />
      )}

      {/* Add Modal */}
      {modal.type === "add" && (
        <BrandModal
          title="Add Brand"
          formData={formData}
          setFormData={setFormData}
          formError={formError}
          submitting={submitting}
          onClose={closeModal}
          onSubmit={handleSubmitAdd}
          existingLogos={Array.from(new Set(brands.map((b) => b.logoUrl).filter((u): u is string => !!u)))}
          parentOptions={brands}
          productCategories={productCategories}
        />
      )}

      {/* Edit Modal */}
      {modal.type === "edit" && modal.brand && (
        <BrandModal
          title="Edit Brand"
          formData={formData}
          setFormData={setFormData}
          formError={formError}
          submitting={submitting}
          onClose={closeModal}
          onSubmit={handleSubmitEdit}
          existingLogos={Array.from(new Set(brands.map((b) => b.logoUrl).filter((u): u is string => !!u)))}
          parentOptions={brands.filter((b) => b._id !== modal.brand!._id)}
          productCategories={productCategories}
        />
      )}

      {/* Delete Modal */}
      {modal.type === "delete" && modal.brand && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-lg bg-surface border border-border rounded-card overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex justify-between items-center">
              <h2 className="h-section">Delete Brand</h2>
              <button onClick={closeModal} className="text-ink-3 hover:text-ink transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-ink-3">
                This action cannot be undone. Type{" "}
                <span className="text-ink font-medium">{modal.brand.name}</span>{" "}
                to confirm deletion.
              </p>
              <Input
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder={modal.brand.name}
              />
            </div>
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <Button variant="secondary" size="sm" onClick={closeModal}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleDelete}
                disabled={deleteConfirmName !== modal.brand.name || submitting}
                loading={submitting}
              >
                Delete Brand
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Series create modal */}
      {seriesModal?.open && (
        <SeriesModal
          brandName={seriesModal.brandName}
          onClose={closeSeriesModal}
          onSubmit={submitSeriesModal}
        />
      )}

      {/* Model create/edit modal */}
      {modelModal?.open && (
        <ModelModal
          state={modelModal}
          seriesOptions={seriesOptions.filter((s) => s.brandId === modelModal.brandId)}
          onClose={closeModelModal}
          onSubmit={submitModelModal}
        />
      )}

      {/* Variant create modal */}
      {variantModal?.open && (
        <VariantModal
          modelName={variantModal.modelName}
          onClose={closeVariantModal}
          onSubmit={submitVariantModal}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table view
// ---------------------------------------------------------------------------

interface LeafRow {
  key: string;
  category: DeviceCategory;
  brand: Brand;
  series: SeriesOption | null;
  model: ModelOption | null; // null = placeholder "no models yet" row
  isFirstOfGroup: boolean; // first row in a contiguous Category+Brand+Series run
}

function CatalogTable({
  brands,
  seriesOptions,
  modelOptions,
  variantOptions,
  categoryFilter,
  search,
  loading,
  onAddBrand,
  onEditBrand,
  onDeleteBrand,
  onAddSeries,
  onRenameSeries,
  onDeleteSeries,
  onAddModel,
  onEditModel,
  onDeleteModel,
  onAddVariant,
  onRenameVariant,
  onDeleteVariant,
}: {
  brands: Brand[];
  seriesOptions: SeriesOption[];
  modelOptions: ModelOption[];
  variantOptions: VariantOption[];
  categoryFilter: DeviceCategory | "";
  search: string;
  loading: boolean;
  onAddBrand: (category?: DeviceCategory) => void;
  onEditBrand: (b: Brand) => void;
  onDeleteBrand: (b: Brand) => void;
  onAddSeries: (b: { _id: string; name: string }) => void;
  onRenameSeries: (s: SeriesOption) => void;
  onDeleteSeries: (s: SeriesOption) => void;
  onAddModel: (b: { _id: string; name: string }, seriesId?: string) => void;
  onEditModel: (b: { _id: string; name: string }, m: ModelOption) => void;
  onDeleteModel: (m: ModelOption) => void;
  onAddVariant: (m: { _id: string; name: string }) => void;
  onRenameVariant: (v: VariantOption) => void;
  onDeleteVariant: (v: VariantOption) => void;
}) {
  const q = search.trim().toLowerCase();

  const categories = categoryFilter ? [categoryFilter] : DEVICE_CATEGORIES;

  // Group brands (top-level only -- sub-brands render nested under a
  // top-level brand's own section via their own category, same as Tree)
  // by category.
  const brandsByCategory = useMemo(() => {
    const map = new Map<DeviceCategory, Brand[]>();
    for (const c of DEVICE_CATEGORIES) map.set(c, []);
    for (const b of brands) {
      if (!b.category) continue;
      map.get(b.category)?.push(b);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [brands]);

  const seriesByBrand = useMemo(() => {
    const map = new Map<string, SeriesOption[]>();
    for (const s of seriesOptions) {
      if (!map.has(s.brandId)) map.set(s.brandId, []);
      map.get(s.brandId)!.push(s);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [seriesOptions]);

  const modelsByBrandSeries = useMemo(() => {
    // key: brandId + "|" + (seriesId || "")
    const map = new Map<string, ModelOption[]>();
    for (const m of modelOptions) {
      const key = `${m.brandId}|${m.seriesId || ""}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [modelOptions]);

  const variantsByModel = useMemo(() => {
    const map = new Map<string, VariantOption[]>();
    for (const v of variantOptions) {
      if (!map.has(v.modelId)) map.set(v.modelId, []);
      map.get(v.modelId)!.push(v);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [variantOptions]);

  function matchesSearch(categoryLabel: string, brandName: string, seriesName: string | null, modelName: string | null, variantName: string | null = null) {
    if (!q) return true;
    return (
      categoryLabel.toLowerCase().includes(q) ||
      brandName.toLowerCase().includes(q) ||
      (seriesName ? seriesName.toLowerCase().includes(q) : false) ||
      (modelName ? modelName.toLowerCase().includes(q) : false) ||
      (variantName ? variantName.toLowerCase().includes(q) : false)
    );
  }

  if (loading) {
    return <LoadingPanel label="Loading…" />;
  }

  return (
    <div className="space-y-6">
      {categories.map((category) => {
        const categoryLabel = DEVICE_CATEGORY_LABELS[category];
        const categoryBrands = (brandsByCategory.get(category) || []).filter((b) => !b.parentId);

        // Pre-compute whether this category has any row matching search --
        // if searching and nothing matches, collapse the whole section.
        let categoryHasMatch = !q || categoryLabel.toLowerCase().includes(q);
        if (!categoryHasMatch) {
          for (const brand of categoryBrands) {
            if (brand.name.toLowerCase().includes(q)) {
              categoryHasMatch = true;
              break;
            }
            const brandSeries = seriesByBrand.get(brand._id) || [];
            for (const s of brandSeries) {
              if (s.name.toLowerCase().includes(q)) categoryHasMatch = true;
            }
            const allBrandModels = modelOptions.filter((m) => m.brandId === brand._id);
            for (const m of allBrandModels) {
              if (m.name.toLowerCase().includes(q)) categoryHasMatch = true;
            }
          }
        }
        if (!categoryHasMatch) return null;

        return (
          <Card key={category} className="overflow-hidden">
            {/* Category section header -- always shown, even with zero brands */}
            <div className="flex items-center justify-between px-4 py-3 bg-surface-2 border-b border-border">
              <div className="flex items-center gap-2">
                <FolderTree size={15} className="text-ink-3" />
                <h3 className="text-sm font-semibold text-ink">{categoryLabel}</h3>
                <span className="text-[11px] text-ink-3">
                  {categoryBrands.length} brand{categoryBrands.length === 1 ? "" : "s"}
                </span>
              </div>
              <Button variant="secondary" size="sm" icon={<Plus size={12} />} onClick={() => onAddBrand(category)}>
                Add Brand
              </Button>
            </div>

            {categoryBrands.length === 0 ? (
              <p className="px-4 py-4 text-xs text-ink-3">
                No brands yet in this category —{" "}
                <button onClick={() => onAddBrand(category)} className="underline hover:text-ink">
                  add the first one
                </button>
                .
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-ink-3 border-b border-border">
                    <th className="px-4 py-2 font-medium">Category</th>
                    <th className="px-4 py-2 font-medium">Brand</th>
                    <th className="px-4 py-2 font-medium">Series</th>
                    <th className="px-4 py-2 font-medium">Model / Variant</th>
                    <th className="px-4 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryBrands.map((brand) => {
                    const brandMatches =
                      !q ||
                      categoryLabel.toLowerCase().includes(q) ||
                      brand.name.toLowerCase().includes(q) ||
                      (seriesByBrand.get(brand._id) || []).some((s) => s.name.toLowerCase().includes(q)) ||
                      modelOptions.some((m) => m.brandId === brand._id && m.name.toLowerCase().includes(q));
                    if (!brandMatches) return null;

                    const brandSeries = seriesByBrand.get(brand._id) || [];
                    const directModels = modelsByBrandSeries.get(`${brand._id}|`) || [];

                    // Build the rows: brand header row, then direct models
                    // (no series), then each series header + its models.
                    const rows: React.ReactNode[] = [];

                    rows.push(
                      <tr key={`brand-${brand._id}`} className="bg-surface-2/60">
                        <td className="px-4 py-2 text-xs text-ink-3" colSpan={2}>
                          <div className="flex items-center gap-2">
                            <Tag size={13} className="text-ink-3" />
                            <span className="font-medium text-ink-2">{brand.name}</span>
                            {!brand.isActive && <span className="text-[10px] text-ink-3">(inactive)</span>}
                          </div>
                        </td>
                        <td className="px-4 py-2" colSpan={2}></td>
                        <td className="px-4 py-2">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => onAddSeries(brand)}
                              className="flex items-center gap-1 px-2 py-1 rounded-control border border-border text-[11px] font-medium text-ink-2 hover:border-border-strong hover:text-ink"
                            >
                              <Plus size={11} /> Series
                            </button>
                            <button
                              onClick={() => onAddModel(brand)}
                              className="flex items-center gap-1 px-2 py-1 rounded-control border border-border text-[11px] font-medium text-ink-2 hover:border-border-strong hover:text-ink"
                            >
                              <Plus size={11} /> Model
                            </button>
                            <button onClick={() => onEditBrand(brand)} className="text-ink-3 hover:text-ink transition-colors" title="Edit brand">
                              <Edit2 size={13} />
                            </button>
                            <button onClick={() => onDeleteBrand(brand)} className="text-ink-3 hover:text-danger transition-colors" title="Delete brand">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );

                    // Direct-under-brand models (no series)
                    if (directModels.length === 0) {
                      // Only show the placeholder if there's no series either
                      // (otherwise the "no models" state is implied and this
                      // row would just be noise above the series sections).
                    } else {
                      directModels
                        .filter((m) => matchesSearch(categoryLabel, brand.name, null, m.name))
                        .forEach((m, idx) => {
                          rows.push(
                            <ModelDataRow
                              key={`model-${m._id}`}
                              categoryLabel={categoryLabel}
                              brandName={brand.name}
                              seriesLabel={null}
                              model={m}
                              variants={(variantsByModel.get(m._id) || []).filter((v) => matchesSearch(categoryLabel, brand.name, null, m.name, v.name))}
                              muted={idx > 0}
                              onEdit={() => onEditModel(brand, m)}
                              onDelete={() => onDeleteModel(m)}
                              onAddVariant={() => onAddVariant(m)}
                              onRenameVariant={onRenameVariant}
                              onDeleteVariant={onDeleteVariant}
                            />
                          );
                        });
                    }
                    if (directModels.length === 0 && brandSeries.length === 0) {
                      rows.push(
                        <tr key={`noseries-noModel-${brand._id}`}>
                          <td className="px-4 py-2 text-xs text-ink-3/70">{categoryLabel}</td>
                          <td className="px-4 py-2 text-xs text-ink-3/70">{brand.name}</td>
                          <td className="px-4 py-2 text-xs text-ink-3">— (direct)</td>
                          <td className="px-4 py-2 text-xs text-ink-3 italic" colSpan={2}>
                            No models yet —{" "}
                            <button onClick={() => onAddModel(brand)} className="underline hover:text-ink not-italic">
                              + Add Model
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    // Series sections
                    brandSeries
                      .filter((s) => !q || brand.name.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || (modelsByBrandSeries.get(`${brand._id}|${s._id}`) || []).some((m) => m.name.toLowerCase().includes(q)))
                      .forEach((series) => {
                        const seriesModels = (modelsByBrandSeries.get(`${brand._id}|${series._id}`) || []).filter((m) =>
                          matchesSearch(categoryLabel, brand.name, series.name, m.name)
                        );
                        rows.push(
                          <tr key={`series-${series._id}`} className="bg-surface-2/30">
                            <td className="px-4 py-2"></td>
                            <td className="px-4 py-2"></td>
                            <td className="px-4 py-2 text-xs" colSpan={2}>
                              <div className="flex items-center gap-2">
                                <Layers size={12} className="text-info" />
                                <span className="font-medium text-ink-2">{series.name}</span>
                                {!series.isActive && <span className="text-[10px] text-ink-3">(inactive)</span>}
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => onAddModel(brand, series._id)}
                                  className="flex items-center gap-1 px-2 py-1 rounded-control border border-border text-[11px] font-medium text-ink-2 hover:border-border-strong hover:text-ink"
                                >
                                  <Plus size={11} /> Model
                                </button>
                                <button onClick={() => onRenameSeries(series)} className="text-ink-3 hover:text-ink transition-colors" title="Rename series">
                                  <Edit2 size={13} />
                                </button>
                                <button onClick={() => onDeleteSeries(series)} className="text-ink-3 hover:text-danger transition-colors" title="Delete series">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                        if (seriesModels.length === 0) {
                          rows.push(
                            <tr key={`series-empty-${series._id}`}>
                              <td className="px-4 py-2 text-xs text-ink-3/70">{categoryLabel}</td>
                              <td className="px-4 py-2 text-xs text-ink-3/70">{brand.name}</td>
                              <td className="px-4 py-2 text-xs text-ink-3/70">{series.name}</td>
                              <td className="px-4 py-2 text-xs text-ink-3 italic" colSpan={2}>
                                No models yet —{" "}
                                <button onClick={() => onAddModel(brand, series._id)} className="underline hover:text-ink not-italic">
                                  + Add Model
                                </button>
                              </td>
                            </tr>
                          );
                        } else {
                          seriesModels.forEach((m, idx) => {
                            rows.push(
                              <ModelDataRow
                                key={`model-${m._id}`}
                                categoryLabel={categoryLabel}
                                brandName={brand.name}
                                seriesLabel={series.name}
                                model={m}
                                variants={(variantsByModel.get(m._id) || []).filter((v) => matchesSearch(categoryLabel, brand.name, series.name, m.name, v.name))}
                                muted={idx > 0}
                                onEdit={() => onEditModel(brand, m)}
                                onDelete={() => onDeleteModel(m)}
                                onAddVariant={() => onAddVariant(m)}
                                onRenameVariant={onRenameVariant}
                                onDeleteVariant={onDeleteVariant}
                              />
                            );
                          });
                        }
                      });

                    return rows;
                  })}
                </tbody>
              </table>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function ModelDataRow({
  categoryLabel,
  brandName,
  seriesLabel,
  model,
  variants,
  muted,
  onEdit,
  onDelete,
  onAddVariant,
  onRenameVariant,
  onDeleteVariant,
}: {
  categoryLabel: string;
  brandName: string;
  seriesLabel: string | null;
  model: ModelOption;
  variants: VariantOption[];
  muted: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onAddVariant: () => void;
  onRenameVariant: (v: VariantOption) => void;
  onDeleteVariant: (v: VariantOption) => void;
}) {
  // Full values always stay in the DOM (for search/accessibility) -- only
  // visually muted on repeats within a contiguous Category+Brand+Series run.
  const dim = muted ? "text-ink-3/60" : "text-ink-2";

  // Models with zero variants render exactly as before -- one row, model
  // name only, plus a new "+ Add Variant" action alongside edit/delete.
  if (variants.length === 0) {
    return (
      <tr className="border-t border-border hover:bg-surface-2/50">
        <td className={`px-4 py-2 text-xs ${dim}`}>{categoryLabel}</td>
        <td className={`px-4 py-2 text-xs ${dim}`}>{brandName}</td>
        <td className={`px-4 py-2 text-xs ${dim}`}>
          {seriesLabel || <span className="text-ink-3 italic">Direct</span>}
        </td>
        <td className={`px-4 py-2 text-xs ${model.isActive ? "text-ink" : "text-ink-3 line-through"} font-medium`}>
          {model.name}
        </td>
        <td className="px-4 py-2">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onAddVariant}
              className="flex items-center gap-1 px-2 py-1 rounded-control border border-border text-[11px] font-medium text-ink-2 hover:border-border-strong hover:text-ink"
            >
              <Plus size={11} /> Variant
            </button>
            <button onClick={onEdit} className="text-ink-3 hover:text-ink transition-colors" title="Rename model">
              <Edit2 size={13} />
            </button>
            <button onClick={onDelete} className="text-ink-3 hover:text-danger transition-colors" title="Delete model">
              <Trash2 size={13} />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  // Models with one or more variants render one row per variant -- model
  // name and variant name stay in separate DOM elements (independently
  // visible/searchable), not concatenated into a single unparseable string.
  return (
    <>
      {variants.map((v, idx) => (
        <tr key={`variant-${v._id}`} className="border-t border-border hover:bg-surface-2/50">
          <td className={`px-4 py-2 text-xs ${dim}`}>{idx === 0 ? categoryLabel : ""}</td>
          <td className={`px-4 py-2 text-xs ${dim}`}>{idx === 0 ? brandName : ""}</td>
          <td className={`px-4 py-2 text-xs ${dim}`}>
            {idx === 0 ? seriesLabel || <span className="text-ink-3 italic">Direct</span> : ""}
          </td>
          <td className={`px-4 py-2 text-xs ${model.isActive ? "text-ink" : "text-ink-3 line-through"} font-medium`}>
            <span>{model.name}</span>
            <span className="text-ink-3 font-normal"> — </span>
            <span className={v.isActive ? "text-ink-2 font-normal" : "text-ink-3 line-through font-normal"}>{v.name}</span>
          </td>
          <td className="px-4 py-2">
            <div className="flex items-center justify-end gap-2">
              {idx === 0 && (
                <>
                  <button
                    onClick={onAddVariant}
                    className="flex items-center gap-1 px-2 py-1 rounded-control border border-border text-[11px] font-medium text-ink-2 hover:border-border-strong hover:text-ink"
                  >
                    <Plus size={11} /> Variant
                  </button>
                  <button onClick={onEdit} className="text-ink-3 hover:text-ink transition-colors" title="Rename model">
                    <Edit2 size={13} />
                  </button>
                  <button onClick={onDelete} className="text-ink-3 hover:text-danger transition-colors" title="Delete model">
                    <Trash2 size={13} />
                  </button>
                  <span className="w-px h-4 bg-border mx-1" />
                </>
              )}
              <button onClick={() => onRenameVariant(v)} className="text-ink-3 hover:text-ink transition-colors" title="Rename variant">
                <Edit2 size={13} />
              </button>
              <button onClick={() => onDeleteVariant(v)} className="text-ink-3 hover:text-danger transition-colors" title="Delete variant">
                <Trash2 size={13} />
              </button>
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Brand modal (unchanged behaviour from the original Brands page)
// ---------------------------------------------------------------------------

function BrandModal({
  title,
  formData,
  setFormData,
  formError,
  submitting,
  onClose,
  onSubmit,
  existingLogos,
  parentOptions,
  productCategories,
}: {
  title: string;
  formData: { name: string; description: string; logoUrl: string; parentId: string; category: DeviceCategory | ""; productCategoryId: string; businessScope: "SINGLE" | "MULTIPLE" | "ALL"; businessIds: string[] };
  setFormData: (d: { name: string; description: string; logoUrl: string; parentId: string; category: DeviceCategory | ""; productCategoryId: string; businessScope: "SINGLE" | "MULTIPLE" | "ALL"; businessIds: string[] }) => void;
  formError: string;
  submitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
  existingLogos: string[];
  parentOptions: Brand[];
  productCategories: ProductCategoryOption[];
}) {
  const [logoPreviewError, setLogoPreviewError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showExisting, setShowExisting] = useState(false);

  useEffect(() => {
    setLogoPreviewError(false);
  }, [formData.logoUrl]);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", `brand-logo-${Date.now()}`);
      fd.append("category", "brand-logo");
      const res = await fetch("/api/assets/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok && data?.asset?.fileUrl) {
        setFormData({ ...formData, logoUrl: data.asset.fileUrl });
      }
    } catch {
      /* preview error state below already covers a broken URL */
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-lg bg-surface border border-border rounded-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex justify-between items-center">
          <h2 className="h-section">{title}</h2>
          <button onClick={onClose} className="text-ink-3 hover:text-ink transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Logo preview */}
          {formData.logoUrl && (
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-control bg-surface border border-border flex items-center justify-center overflow-hidden">
                {!logoPreviewError ? (
                  <img
                    src={formData.logoUrl}
                    alt="Logo preview"
                    className="w-full h-full object-contain p-2"
                    onError={() => setLogoPreviewError(true)}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <ImageOff size={20} className="text-ink-3" />
                    <span className="text-xs text-ink-3">Invalid URL</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <Field label="Brand Name" required>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Tata, Bosch, Samsung"
              autoFocus
            />
          </Field>

          <Field label="Description">
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of the brand…"
              rows={3}
            />
          </Field>

          <Field label="Device Category">
            <Select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value as DeviceCategory | "" })}
            >
              <option value="">Uncategorized</option>
              {DEVICE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{DEVICE_CATEGORY_LABELS[c]}</option>
              ))}
            </Select>
          </Field>

          <Field
            label="Storefront Product Category"
            hint="Which storefront category this brand sells under -- narrows the Brand list the vendor product-creation wizard shows once that category is picked."
          >
            <Select
              value={formData.productCategoryId}
              onChange={(e) => setFormData({ ...formData, productCategoryId: e.target.value })}
            >
              <option value="">Untagged</option>
              {productCategories.map((c) => (
                <option key={c._id} value={c._id}>{c.parentId ? `↳ ${c.name}` : c.name}</option>
              ))}
            </Select>
          </Field>

          <Field
            label="Parent Brand"
            hint={parentOptions.length === 0 ? "No other brands exist yet — save this one first, then create another and pick this as its parent." : undefined}
          >
            <Select
              value={formData.parentId}
              onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
            >
              <option value="">None (top-level brand)</option>
              {parentOptions.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.parentId ? `↳ ${b.name}` : b.name}
                </option>
              ))}
            </Select>
          </Field>

          <div>
            <label className="text-xs text-ink-3 block mb-1">Logo (optional)</label>
            <div className="flex items-center gap-2">
              <label className={`flex items-center gap-1.5 px-3 py-2 rounded-control border border-border text-xs font-medium text-ink-2 cursor-pointer hover:bg-surface-2 ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
                {uploading ? "Uploading…" : "Upload Logo"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(file);
                    e.target.value = "";
                  }}
                />
              </label>
              {existingLogos.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowExisting((s) => !s)}
                  className="px-3 py-2 rounded-control border border-border text-xs font-medium text-ink-2 hover:bg-surface-2"
                >
                  Choose Existing
                </button>
              )}
            </div>

            {showExisting && existingLogos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2 p-2 border border-border rounded-control bg-surface-2 max-h-32 overflow-y-auto">
                {existingLogos.map((url) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => {
                      setFormData({ ...formData, logoUrl: url });
                      setShowExisting(false);
                    }}
                    className="w-12 h-12 rounded-control border border-border bg-surface overflow-hidden hover:border-border-strong"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-full h-full object-contain p-1" />
                  </button>
                ))}
              </div>
            )}

            <Input
              value={formData.logoUrl}
              onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
              placeholder="Or paste a logo URL directly"
              className="mt-2"
            />
          </div>

          <BusinessScopeControl
            value={{ businessScope: formData.businessScope, businessIds: formData.businessIds }}
            onChange={(v) => setFormData({ ...formData, ...v })}
          />

          {formError && (
            <div className="flex items-center gap-2 text-xs text-danger bg-danger-soft border border-danger/20 rounded-control px-3 py-2">
              <AlertCircle size={13} />
              {formError}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={onSubmit} disabled={submitting} loading={submitting}>
            {title}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Series create modal (matches BrandModal's visual style)
// ---------------------------------------------------------------------------

function SeriesModal({
  brandName,
  onClose,
  onSubmit,
}: {
  brandName: string;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(name);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-lg bg-surface border border-border rounded-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex justify-between items-center">
          <h2 className="h-section">Add Series</h2>
          <button onClick={onClose} className="text-ink-3 hover:text-ink transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <Field label="Brand">
            <Input value={brandName} disabled />
          </Field>
          <Field label="Series Name" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="e.g. Galaxy S, Galaxy A"
              autoFocus
            />
          </Field>
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || !name.trim()}
            loading={submitting}
          >
            Add Series
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Model create/edit modal (matches BrandModal's visual style)
// ---------------------------------------------------------------------------

function ModelModal({
  state,
  seriesOptions,
  onClose,
  onSubmit,
}: {
  state: ModelModalState;
  seriesOptions: SeriesOption[];
  onClose: () => void;
  onSubmit: (name: string, seriesId: string, isActive: boolean) => void;
}) {
  const [name, setName] = useState(state.model?.name || "");
  const [seriesId, setSeriesId] = useState(state.seriesId || "");
  const [isActive, setIsActive] = useState(state.model?.isActive ?? true);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(name, seriesId, isActive);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-lg bg-surface border border-border rounded-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex justify-between items-center">
          <h2 className="h-section">{state.mode === "edit" ? "Edit Model" : "Add Model"}</h2>
          <button onClick={onClose} className="text-ink-3 hover:text-ink transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <Field label="Brand">
            <Input value={state.brandName} disabled />
          </Field>

          <Field label="Series">
            <Select value={seriesId} onChange={(e) => setSeriesId(e.target.value)}>
              <option value="">No series (direct under brand)</option>
              {seriesOptions.map((s) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Model / Variant Name" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="e.g. A35 8+128, iPhone 15 Pro Max 256GB"
              autoFocus
            />
          </Field>

          {state.mode === "edit" && (
            <div className="flex items-center justify-between px-3 py-2 border border-border rounded-control">
              <span className="text-xs text-ink-2">Active</span>
              <button
                type="button"
                onClick={() => setIsActive((v) => !v)}
                className={`relative w-9 h-5 rounded-full transition-colors ${isActive ? "bg-success" : "bg-surface-3"}`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    isActive ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || !name.trim()}
            loading={submitting}
          >
            {state.mode === "edit" ? "Save Changes" : "Add Model"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variant create modal (matches SeriesModal's visual style)
// ---------------------------------------------------------------------------

function VariantModal({
  modelName,
  onClose,
  onSubmit,
}: {
  modelName: string;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(name);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-lg bg-surface border border-border rounded-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex justify-between items-center">
          <h2 className="h-section">Add Variant</h2>
          <button onClick={onClose} className="text-ink-3 hover:text-ink transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <Field label="Model">
            <Input value={modelName} disabled />
          </Field>
          <Field label="Variant Name" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="e.g. 8GB RAM + 128GB Storage, Awesome Navy"
              autoFocus
            />
          </Field>
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || !name.trim()}
            loading={submitting}
          >
            Add Variant
          </Button>
        </div>
      </div>
    </div>
  );
}
