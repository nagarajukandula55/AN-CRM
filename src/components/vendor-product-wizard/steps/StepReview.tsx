"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  suggestSeoTitle,
  suggestSeoDescription,
  suggestSeoKeywords,
} from "@/lib/slugify";

interface StepReviewProps {
  draftId: string;
  next: () => void;
  back: () => void;
}

interface ProductSnapshot {
  productName?: string;
  variantName?: string;
  description?: string;
  slug?: string;
  images?: string[];
  categoryId?: { name?: string } | string;
  brandId?: { name?: string } | string;
  vendorSku?: string;
  vendorCost?: number;
  unit?: string;
  packSize?: number;
  netWeight?: number;
  hsnCode?: string;
  gstRate?: number;
  seo?: { customTitle?: string; customDescription?: string; keywords?: string[] };
}

export default function StepReview({
  draftId,
  next,
  back,
}: StepReviewProps) {
  const router = useRouter();
  const [creatingVariant, setCreatingVariant] = useState(false);
  const [variantSizesInput, setVariantSizesInput] = useState("");
  const [generatingVariants, setGeneratingVariants] = useState(false);
  const [variantResult, setVariantResult] = useState<{ created: any[]; failed: any[] } | null>(null);
  const [variantError, setVariantError] = useState<string | null>(null);
  const [product, setProduct] = useState<ProductSnapshot | null>(null);
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [seoKeywords, setSeoKeywords] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/vendor-products/${draftId}`);
        const data = await res.json();
        if (data.success && data.data) {
          const p: ProductSnapshot = data.data;
          setProduct(p);
          setImages(p.images || []);

          const categoryName =
            typeof p.categoryId === "object" ? p.categoryId?.name : undefined;
          const brandName =
            typeof p.brandId === "object" ? p.brandId?.name : undefined;

          setSeoTitle(
            p.seo?.customTitle ||
              suggestSeoTitle(p.productName, p.variantName, brandName)
          );
          setSeoDescription(
            p.seo?.customDescription ||
              suggestSeoDescription(p.description, p.productName)
          );
          setSeoKeywords(
            (p.seo?.keywords?.length
              ? p.seo.keywords
              : suggestSeoKeywords(p.productName, categoryName, brandName)
            ).join(", ")
          );
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [draftId]);

  async function uploadOne(file: File): Promise<string | null> {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/assets/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || data.message || `Failed to upload ${file.name}`);
    }
    return data.asset?.fileUrl || null;
  }

  // Uploads every selected file, one at a time (the upload endpoint takes a
  // single file per request) -- was only ever reading e.target.files[0], so
  // picking several images at once silently kept just the first.
  async function handleImagesUpload(files: File[]) {
    setUploading(true);
    setError(null);
    try {
      const urls: string[] = [];
      for (const file of files) {
        const url = await uploadOne(file);
        if (url) urls.push(url);
      }
      if (urls.length) setImages((prev) => [...prev, ...urls]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setError(null);
    try {
      setSaving(true);
      const res = await fetch(`/api/vendor-products/${draftId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images,
          seo: {
            customTitle: seoTitle,
            customDescription: seoDescription,
            keywords: seoKeywords
              .split(",")
              .map((k) => k.trim())
              .filter(Boolean),
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        setError(data.message || "Failed to save — please try again");
        return;
      }
      next();
    } catch {
      setError("Failed to connect to server");
    } finally {
      setSaving(false);
    }
  }

  // Starts a second draft that reuses this product's name/category/brand/
  // images/SEO so it groups with this one as another pack-size/variant of
  // the same product on the storefront (see approve route's
  // variantGroupKey) -- everything structure/BOM/commercial-specific is
  // left blank for the new draft to fill in on its own.
  async function handleCreateVariant() {
    setCreatingVariant(true);
    try {
      router.push(`/vendor/products/new?cloneFromDraftId=${draftId}`);
    } finally {
      setCreatingVariant(false);
    }
  }

  // Parses "500, 250" (numbers only, reusing this product's own unit) into
  // the sizes the generate-variants endpoint expects.
  function parseSizes(): { netWeight: number; unit: string }[] {
    const unit = product?.unit || "";
    return variantSizesInput
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => n > 0)
      .map((netWeight) => ({ netWeight, unit }));
  }

  // Generates every requested pack size end-to-end -- scaled ingredients,
  // scaled manufacturing cost, copied packing/commercial/compliance,
  // computed MRP/price, submitted for approval -- with no further wizard
  // steps to click through per size (see generate-variants/route.ts for
  // exactly what scales vs. what's copied as-is).
  async function handleGenerateVariants() {
    setVariantError(null);
    setVariantResult(null);
    const sizes = parseSizes();
    if (!sizes.length) {
      setVariantError(`Enter one or more sizes in ${product?.unit || "this product's unit"}, comma-separated (e.g. "500, 250").`);
      return;
    }
    setGeneratingVariants(true);
    try {
      const res = await fetch(`/api/vendor-products/${draftId}/generate-variants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sizes }),
      });
      const data = await res.json();
      if (!data.success) {
        setVariantError(data.message || "Failed to generate variants");
        return;
      }
      setVariantResult({ created: data.created || [], failed: data.failed || [] });
      setVariantSizesInput("");
    } finally {
      setGeneratingVariants(false);
    }
  }

  const inputClass = "w-full border rounded p-2";
  const labelClass = "text-xs font-medium text-gray-500";

  if (loading) {
    return <p className="text-sm text-gray-500">Loading product summary…</p>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Review, Images & SEO</h2>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Summary */}
      <div className="rounded-lg border bg-gray-50 p-4 text-sm space-y-1">
        <p><span className="text-gray-500">Product:</span> {product?.productName} {product?.variantName ? `— ${product.variantName}` : ""}</p>
        <p><span className="text-gray-500">Slug:</span> <span className="font-mono">{product?.slug || "—"}</span></p>
        <p><span className="text-gray-500">Vendor SKU:</span> {product?.vendorSku || "—"}</p>
        <p><span className="text-gray-500">Unit / Pack:</span> {product?.unit || "—"} × {product?.packSize ?? "—"}</p>
        <p><span className="text-gray-500">HSN / GST:</span> {product?.hsnCode || "—"} / {product?.gstRate ?? 0}%</p>
      </div>

      {product?.netWeight && product?.unit ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm space-y-2">
          <p className="text-blue-800">
            Selling this in other pack sizes too? Enter them below ({product.unit}, comma-separated) — ingredients and
            manufacturing cost scale automatically from this {product.netWeight}{product.unit} version, packing/images/SEO
            carry over as-is, and each one is generated, priced, and submitted for approval immediately — no extra steps.
          </p>
          {variantError && <p className="text-red-600">{variantError}</p>}
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded p-2 text-sm"
              placeholder={`e.g. 500, 250 (${product.unit})`}
              value={variantSizesInput}
              onChange={(e) => setVariantSizesInput(e.target.value)}
            />
            <button
              type="button"
              onClick={handleGenerateVariants}
              disabled={generatingVariants}
              className="shrink-0 rounded border border-blue-400 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
            >
              {generatingVariants ? "Generating…" : "Generate Variants"}
            </button>
          </div>
          {variantResult && (
            <div className="text-xs space-y-1 pt-1">
              {variantResult.created.map((v: any) => (
                <p key={v.id} className="text-emerald-700">
                  ✓ {v.label} created — SKU {v.vendorSku}, MRP ₹{v.mrp}, selling price ₹{v.suggestedSellingPrice}, submitted for approval.
                </p>
              ))}
              {variantResult.failed.map((f: any, i: number) => (
                <p key={i} className="text-red-600">✕ {f.size}: {f.message}</p>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm flex items-center justify-between gap-3">
          <p className="text-blue-800">
            Selling this product in another pack size too? Create it as a
            variant of this same product — buyers will see both sizes
            together on the product page.
          </p>
          <button
            type="button"
            onClick={handleCreateVariant}
            disabled={creatingVariant}
            className="shrink-0 rounded border border-blue-400 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            {creatingVariant ? "Starting…" : "+ Create another variant"}
          </button>
        </div>
      )}

      {/* Images */}
      <div>
        <label className={labelClass}>
          Product Images{" "}
          <span className="text-gray-400 font-normal">
            (first image is the featured image shown in listings — click another to make it featured)
          </span>
        </label>
        <div className="mt-2 flex flex-wrap gap-3">
          {images.map((url, i) => (
            <div
              key={url}
              className={`relative h-20 w-20 overflow-hidden rounded border-2 ${i === 0 ? "border-blue-500" : "border-transparent"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                className="h-full w-full object-cover cursor-pointer"
                title={i === 0 ? "Featured image" : "Click to make this the featured image"}
                onClick={() => {
                  if (i === 0) return;
                  setImages([url, ...images.filter((_, idx) => idx !== i)]);
                }}
              />
              {i === 0 && (
                <span className="absolute left-0.5 top-0.5 rounded bg-blue-600 px-1 text-[10px] text-white">Featured</span>
              )}
              <button
                onClick={() => setImages(images.filter((_, idx) => idx !== i))}
                className="absolute right-0.5 top-0.5 rounded-full bg-black/60 px-1 text-xs text-white"
              >
                ×
              </button>
            </div>
          ))}

          <label className={`flex h-20 w-20 cursor-pointer items-center justify-center rounded border-2 border-dashed text-xs text-gray-400 ${uploading ? "opacity-50" : "hover:border-gray-400"}`}>
            {uploading ? "…" : "+ Add"}
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length) handleImagesUpload(files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      {/* SEO */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">
          SEO{" "}
          <span className="font-normal text-gray-400">
            (suggested automatically — edit if needed)
          </span>
        </h3>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>SEO Title</label>
          <input
            className={inputClass}
            value={seoTitle}
            maxLength={70}
            onChange={(e) => setSeoTitle(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>SEO Description</label>
          <textarea
            className={inputClass}
            rows={2}
            maxLength={160}
            value={seoDescription}
            onChange={(e) => setSeoDescription(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>Keywords (comma-separated)</label>
          <input
            className={inputClass}
            value={seoKeywords}
            onChange={(e) => setSeoKeywords(e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <button onClick={back} className="rounded border px-4 py-2">
          Back
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Continue to Submit"}
        </button>
      </div>
    </div>
  );
}
