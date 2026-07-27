"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  ArrowLeft,
  Upload,
  CheckCircle,
  AlertCircle,
  Trash2,
  Scissors,
  X,
  Search,
  ImageOff,
} from "lucide-react";
import { useActiveBusinessId } from "@/hooks/useActiveBusinessId";
import { DESIGN_COMPONENT_CATEGORIES, type DesignComponentCategory } from "@/core/design/componentCategories";

interface SourceAsset {
  _id: string;
  name: string;
  fileUrl: string;
  thumbnailUrl?: string;
  createdAt: string;
}

interface ComponentRow {
  _id: string;
  name: string;
  category: DesignComponentCategory;
  assetId?: { fileUrl?: string; thumbnailUrl?: string };
  createdAt: string;
}

export default function DesignAssetsPage() {
  const { businessId } = useActiveBusinessId();
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [splitAsset, setSplitAsset] = useState<SourceAsset | null>(null);
  const [componentSearch, setComponentSearch] = useState("");
  const [debouncedComponentSearch, setDebouncedComponentSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<DesignComponentCategory | "">("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedComponentSearch(componentSearch), 250);
    return () => clearTimeout(t);
  }, [componentSearch]);

  const { data: sourcesData, mutate: loadSources } = useSWR(`/api/assets?category=design-source`);
  const sources: SourceAsset[] = Array.isArray(sourcesData) ? sourcesData : [];

  const componentsParams = businessId
    ? (() => {
        const params = new URLSearchParams({ businessId, includeInactive: "false" });
        if (categoryFilter) params.set("category", categoryFilter);
        if (debouncedComponentSearch) params.set("search", debouncedComponentSearch);
        return params.toString();
      })()
    : null;
  const { data: componentsData, mutate: loadComponents } = useSWR(
    componentsParams ? `/api/design/components?${componentsParams}` : null,
    { keepPreviousData: true }
  );
  const components: ComponentRow[] = componentsData?.success ? componentsData.components || [] : [];

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", file.name.replace(/\.[^/.]+$/, ""));
      fd.append("category", "design-source");
      const res = await fetch("/api/assets/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || "Upload failed.", false);
        return;
      }
      showToast("Uploaded.");
      loadSources();
    } catch {
      showToast("Network error.", false);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteSource = async (asset: SourceAsset) => {
    if (!window.confirm(`Delete "${asset.name}"?`)) return;
    try {
      const res = await fetch(`/api/assets/${asset._id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || "Failed to delete.", false);
        return;
      }
      showToast("Deleted.");
      loadSources();
    } catch {
      showToast("Network error.", false);
    }
  };

  const handleDeleteComponent = async (c: ComponentRow) => {
    if (!window.confirm(`Delete component "${c.name}"?`)) return;
    try {
      const res = await fetch(`/api/design/components/${c._id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || "Failed to delete.", false);
        return;
      }
      showToast("Component deleted.");
      loadComponents();
    } catch {
      showToast("Network error.", false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium shadow-xl transition-all ${
            toast.ok
              ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-600"
              : "bg-red-500/10 border border-red-500/20 text-red-600"
          }`}
        >
          {toast.ok ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
          {toast.msg}
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <Link href="/admin/design-studio" className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 mb-2">
            <ArrowLeft size={12} /> Back to Design Studio
          </Link>
          <h1 className="text-xl font-semibold text-gray-900">Asset Library</h1>
          <p className="text-sm text-gray-500 mt-0.5 max-w-2xl">
            Upload logos and product labels, then manually crop them into named, reusable
            components (a human draws the crop box — no automatic segmentation).
          </p>
        </div>
        <label
          className={`flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 cursor-pointer shrink-0 ${uploading ? "opacity-50 pointer-events-none" : ""}`}
        >
          <Upload size={16} />
          {uploading ? "Uploading…" : "Upload Image"}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {/* Uploaded source images */}
      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Uploaded Images</h2>
        {sources.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
            <Upload className="mx-auto text-gray-300" size={28} />
            <p className="mt-2 text-sm text-gray-500">No images uploaded yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {sources.map((s) => (
              <div key={s._id} className="rounded-xl border border-gray-200 bg-white overflow-hidden group">
                <button onClick={() => setSplitAsset(s)} className="block w-full aspect-square bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.thumbnailUrl || s.fileUrl} alt={s.name} className="w-full h-full object-contain" />
                </button>
                <div className="p-2 space-y-1.5">
                  <p className="text-xs font-medium text-gray-900 truncate" title={s.name}>
                    {s.name}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setSplitAsset(s)}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-lg border border-gray-200 text-[11px] font-medium text-gray-600 hover:border-gray-400"
                    >
                      <Scissors size={11} /> Split
                    </button>
                    <button
                      onClick={() => handleDeleteSource(s)}
                      className="px-2 py-1 rounded-lg border border-gray-200 text-[11px] font-medium text-red-500 hover:border-red-300"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Saved components */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">Saved Components</h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={componentSearch}
                onChange={(e) => setComponentSearch(e.target.value)}
                placeholder="Search components…"
                className="pl-8 pr-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as DesignComponentCategory | "")}
              className="px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-gray-400"
            >
              <option value="">All Categories</option>
              {DESIGN_COMPONENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        {components.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
            <ImageOff className="mx-auto text-gray-300" size={28} />
            <p className="mt-2 text-sm text-gray-500">No components saved yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {components.map((c) => (
              <div key={c._id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="aspect-square bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.assetId?.thumbnailUrl || c.assetId?.fileUrl}
                    alt={c.name}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="p-2 space-y-1">
                  <p className="text-xs font-medium text-gray-900 truncate" title={c.name}>
                    {c.name}
                  </p>
                  <p className="text-[10px] text-gray-400">{c.category}</p>
                  <button
                    onClick={() => handleDeleteComponent(c)}
                    className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded-lg border border-gray-200 text-[11px] font-medium text-red-500 hover:border-red-300"
                  >
                    <Trash2 size={11} /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {splitAsset && (
        <SplitModal
          asset={splitAsset}
          businessId={businessId}
          onClose={() => setSplitAsset(null)}
          onSaved={() => {
            loadComponents();
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Split into Components modal — draws the source image on a plain 2D canvas,
// lets the user drag out a crop rectangle, name + categorize it, and save it
// as a DesignComponent. Multiple crops can be saved in one session.
// ---------------------------------------------------------------------------

interface SavedFromSession {
  name: string;
  category: DesignComponentCategory;
}

function SplitModal({
  asset,
  businessId,
  onClose,
  onSaved,
  showToast,
}: {
  asset: SourceAsset;
  businessId: string | null;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string, ok?: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<DesignComponentCategory>("OTHER");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SavedFromSession[]>([]);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0);
    };
    img.src = asset.fileUrl;
  }, [asset.fileUrl]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    if (drag) {
      const x = Math.min(drag.x0, drag.x1);
      const y = Math.min(drag.y0, drag.y1);
      const w = Math.abs(drag.x1 - drag.x0);
      const h = Math.abs(drag.y1 - drag.y0);
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = "rgba(17,24,39,0.08)";
      ctx.fillRect(x, y, w, h);
    }
  }, [drag]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getPos(e);
    setDrag({ x0: pos.x, y0: pos.y, x1: pos.x, y1: pos.y });
    setDragging(true);
  };
  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragging || !drag) return;
    const pos = getPos(e);
    setDrag({ ...drag, x1: pos.x, y1: pos.y });
  };
  const onMouseUp = () => setDragging(false);

  const cropRect = drag
    ? {
        x: Math.round(Math.min(drag.x0, drag.x1)),
        y: Math.round(Math.min(drag.y0, drag.y1)),
        w: Math.round(Math.abs(drag.x1 - drag.x0)),
        h: Math.round(Math.abs(drag.y1 - drag.y0)),
      }
    : null;

  const handleSaveComponent = async () => {
    if (!businessId || !cropRect || cropRect.w < 4 || cropRect.h < 4 || !name.trim()) {
      showToast("Draw a crop region and enter a name first.", false);
      return;
    }
    const img = imgRef.current;
    if (!img) return;
    setSaving(true);
    try {
      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = cropRect.w;
      cropCanvas.height = cropRect.h;
      const ctx = cropCanvas.getContext("2d");
      ctx?.drawImage(img, cropRect.x, cropRect.y, cropRect.w, cropRect.h, 0, 0, cropRect.w, cropRect.h);

      const blob: Blob = await new Promise((resolve, reject) =>
        cropCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png")
      );

      const fd = new FormData();
      fd.append("file", blob, `${name.trim()}.png`);
      fd.append("name", name.trim());
      fd.append("category", "design-component");
      const uploadRes = await fetch("/api/assets/upload", { method: "POST", body: fd });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.success) {
        showToast(uploadData.error || "Upload failed.", false);
        return;
      }

      const compRes = await fetch("/api/design/components", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          name: name.trim(),
          category,
          assetId: uploadData.asset._id,
          sourceAssetId: asset._id,
          width: cropRect.w,
          height: cropRect.h,
        }),
      });
      const compData = await compRes.json();
      if (!compRes.ok || !compData.success) {
        showToast(compData.error || "Failed to save component.", false);
        return;
      }

      showToast(`Saved "${name.trim()}" as a component.`);
      setSaved((prev) => [...prev, { name: name.trim(), category }]);
      setName("");
      setDrag(null);
      onSaved();
    } catch {
      showToast("Network error.", false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-4xl bg-white border border-gray-200 rounded-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Split into Components</h2>
            <p className="text-xs text-gray-400 mt-0.5">Drag a rectangle over {asset.name} to crop a region.</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-gray-50 rounded-xl border border-gray-200 overflow-auto flex items-center justify-center p-3">
            <canvas
              ref={canvasRef}
              className="max-w-full cursor-crosshair border border-gray-200"
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
            />
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Component name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Front Label"
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as DesignComponentCategory)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-gray-400"
              >
                {DESIGN_COMPONENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            {cropRect && (
              <p className="text-[11px] text-gray-400">
                Selection: {cropRect.w} × {cropRect.h}px
              </p>
            )}
            <button
              onClick={handleSaveComponent}
              disabled={saving || !cropRect || cropRect.w < 4 || !name.trim()}
              className="w-full px-3 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save as Component"}
            </button>

            {saved.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1.5">Saved from this image ({saved.length})</p>
                <ul className="space-y-1">
                  {saved.map((s, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-gray-600 px-2 py-1.5 rounded-lg border border-gray-100 bg-gray-50">
                      <CheckCircle size={12} className="text-emerald-500 shrink-0" />
                      {s.name} <span className="text-gray-400">({s.category})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
