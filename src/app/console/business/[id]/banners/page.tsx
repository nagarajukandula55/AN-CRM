"use client";

// Homepage hero-slideshow banner manager for a storefront tenant (Native,
// etc). Replaces the old workflow of the project owner manually dropping
// static image files into a folder -- images are uploaded here via the same
// Cloudinary pipeline used for business logo/favicon
// (see ../page.tsx's handleBrandingUpload and /api/assets/upload), then
// saved as a Banner record via /api/admin/banners. The public, read-only
// counterpart consumed by the storefront frontend is
// GET /api/storefront/banners?businessId=....

import React, { useEffect, useState } from "react";
import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface Banner {
  _id: string;
  imageUrl: string;
  heading?: string;
  subheading?: string;
  ctaText?: string;
  ctaLink?: string;
  sortOrder: number;
  isActive: boolean;
}

export default function BannersPage() {
  const params = useParams();
  const router = useRouter();
  const businessId = typeof params?.id === "string" ? params.id : String(params?.id ?? "");

  const [banners, setBanners] = useState<Banner[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const {
    data: bannersRes,
    isLoading: loading,
    error: bannersSwrError,
    mutate: load,
  } = useSWR(businessId ? `/api/admin/banners?businessId=${businessId}` : null);

  // The table below edits `banners` as local, per-keystroke controlled-input
  // state (persisted on blur via patchBanner) — so it stays a plain useState
  // synced from the SWR cache, rather than being derived from it directly.
  useEffect(() => {
    if (bannersRes?.success) {
      setBanners(bannersRes.banners || []);
      setError(null);
    } else if (bannersRes && !bannersRes.success) {
      setError(bannersRes.error || "Failed to load banners");
    }
  }, [bannersRes]);

  useEffect(() => {
    if (bannersSwrError) setError("Failed to connect to server");
  }, [bannersSwrError]);

  async function handleAddBanner(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", `banner-${Date.now()}`);
      fd.append("category", "banner");
      const uploadRes = await fetch("/api/assets/upload", { method: "POST", body: fd });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.success) {
        throw new Error(uploadData.error || uploadData.message || "Failed to upload image");
      }

      const createRes = await fetch("/api/admin/banners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          imageUrl: uploadData.asset?.fileUrl,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok || !createData.success) {
        throw new Error(createData.error || "Failed to create banner");
      }
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to add banner");
    } finally {
      setUploading(false);
    }
  }

  async function patchBanner(id: string, updates: Partial<Banner>) {
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/banners/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to update banner");
      }
      setBanners((prev) => prev.map((b) => (b._id === id ? { ...b, ...data.banner } : b)));
    } catch (err: any) {
      setError(err?.message || "Failed to update banner");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteBanner(id: string) {
    if (!confirm("Delete this banner?")) return;
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/banners/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete banner");
      }
      setBanners((prev) => prev.filter((b) => b._id !== id));
    } catch (err: any) {
      setError(err?.message || "Failed to delete banner");
    } finally {
      setSavingId(null);
    }
  }

  async function move(id: string, direction: -1 | 1) {
    const index = banners.findIndex((b) => b._id === id);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= banners.length) return;

    const a = banners[index];
    const b = banners[swapIndex];
    const reordered = [...banners];
    reordered[index] = b;
    reordered[swapIndex] = a;
    setBanners(reordered);

    // Swap sortOrder values on the server so the new order persists.
    await Promise.all([
      fetch(`/api/admin/banners/${a._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: b.sortOrder }),
      }),
      fetch(`/api/admin/banners/${b._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: a.sortOrder }),
      }),
    ]).catch(() => {});
    load();
  }

  const inputCls =
    "w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/60";
  const labelCls = "block text-xs uppercase tracking-wide text-white/50 mb-1";

  if (loading) {
    return <div className="p-10 text-white bg-[#07111f] min-h-screen">Loading banners...</div>;
  }

  return (
    <div className="p-10 text-white bg-[#07111f] min-h-screen">
      <button
        onClick={() => router.push(`/console/business/${businessId}`)}
        className="text-xs text-cyan-400 underline mb-2"
      >
        &larr; Back to business
      </button>
      <h1 className="text-3xl font-bold">Homepage Banners</h1>
      <p className="mt-1 text-sm text-white/50">
        Manage the storefront's homepage hero slideshow. Uploaded images are
        automatically cropped/fit to the slideshow's aspect ratio on the
        frontend — no need to pre-crop to an exact size.
      </p>

      {error && (
        <div className="mt-4 rounded border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mt-6 rounded-lg border border-dashed border-white/20 bg-white/5 p-6 text-center">
        <label className="cursor-pointer inline-flex flex-col items-center gap-2">
          <span className="bg-cyan-500 px-4 py-2 text-black font-bold rounded text-sm">
            {uploading ? "Uploading…" : "+ Add Banner"}
          </span>
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleAddBanner(file);
              e.target.value = "";
            }}
          />
        </label>
        <p className="mt-2 text-xs text-white/40">
          Pick an image to upload it and add it to the slideshow.
        </p>
      </div>

      <div className="mt-6 space-y-4">
        {banners.length === 0 ? (
          <p className="text-sm text-white/50">No banners yet. Add one above.</p>
        ) : (
          banners.map((banner, idx) => (
            <div
              key={banner._id}
              className="rounded-lg border border-white/10 bg-white/5 p-4 flex flex-col md:flex-row gap-4"
            >
              <img
                src={banner.imageUrl}
                alt={banner.heading || "Banner preview"}
                className="w-full md:w-48 h-28 object-cover rounded border border-white/10 bg-black/30"
              />
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Heading</label>
                  <input
                    className={inputCls}
                    value={banner.heading || ""}
                    onChange={(e) =>
                      setBanners((prev) =>
                        prev.map((b) => (b._id === banner._id ? { ...b, heading: e.target.value } : b))
                      )
                    }
                    onBlur={(e) => patchBanner(banner._id, { heading: e.target.value })}
                    placeholder="Heading"
                  />
                </div>
                <div>
                  <label className={labelCls}>Subheading</label>
                  <input
                    className={inputCls}
                    value={banner.subheading || ""}
                    onChange={(e) =>
                      setBanners((prev) =>
                        prev.map((b) => (b._id === banner._id ? { ...b, subheading: e.target.value } : b))
                      )
                    }
                    onBlur={(e) => patchBanner(banner._id, { subheading: e.target.value })}
                    placeholder="Subheading"
                  />
                </div>
                <div>
                  <label className={labelCls}>CTA Text</label>
                  <input
                    className={inputCls}
                    value={banner.ctaText || ""}
                    onChange={(e) =>
                      setBanners((prev) =>
                        prev.map((b) => (b._id === banner._id ? { ...b, ctaText: e.target.value } : b))
                      )
                    }
                    onBlur={(e) => patchBanner(banner._id, { ctaText: e.target.value })}
                    placeholder="SHOP NOW"
                  />
                </div>
                <div>
                  <label className={labelCls}>CTA Link</label>
                  <input
                    className={inputCls}
                    value={banner.ctaLink || ""}
                    onChange={(e) =>
                      setBanners((prev) =>
                        prev.map((b) => (b._id === banner._id ? { ...b, ctaLink: e.target.value } : b))
                      )
                    }
                    onBlur={(e) => patchBanner(banner._id, { ctaLink: e.target.value })}
                    placeholder="/products"
                  />
                </div>
              </div>
              <div className="flex md:flex-col items-center justify-between gap-2">
                <div className="flex md:flex-col gap-1">
                  <button
                    disabled={idx === 0 || savingId === banner._id}
                    onClick={() => move(banner._id, -1)}
                    className="px-2 py-1 text-xs rounded border border-white/10 bg-white/5 disabled:opacity-30"
                    title="Move up"
                  >
                    ▲
                  </button>
                  <button
                    disabled={idx === banners.length - 1 || savingId === banner._id}
                    onClick={() => move(banner._id, 1)}
                    className="px-2 py-1 text-xs rounded border border-white/10 bg-white/5 disabled:opacity-30"
                    title="Move down"
                  >
                    ▼
                  </button>
                </div>
                <label className="flex items-center gap-1 text-xs text-white/70">
                  <input
                    type="checkbox"
                    checked={banner.isActive}
                    disabled={savingId === banner._id}
                    onChange={(e) => patchBanner(banner._id, { isActive: e.target.checked })}
                  />
                  Active
                </label>
                <button
                  disabled={savingId === banner._id}
                  onClick={() => deleteBanner(banner._id)}
                  className="px-2 py-1 text-xs rounded border border-red-500/40 bg-red-500/10 text-red-300 disabled:opacity-30"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-6">
        <Link href={`/console/business/${businessId}`} className="text-cyan-400 underline text-sm">
          &larr; Back to business
        </Link>
      </div>
    </div>
  );
}
