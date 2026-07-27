"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  Plus,
  Palette,
  Image as ImageIcon,
  CheckCircle,
  AlertCircle,
  Copy,
  Trash2,
  Pencil,
  FolderOpen,
} from "lucide-react";
import { useActiveBusinessId } from "@/hooks/useActiveBusinessId";

interface DesignCard {
  _id: string;
  name: string;
  isTemplate: boolean;
  canvasWidth: number;
  canvasHeight: number;
  thumbnailAssetId?: { fileUrl?: string; thumbnailUrl?: string } | null;
  updatedAt: string;
}

export default function DesignStudioPage() {
  const { businessId } = useActiveBusinessId();
  const [tab, setTab] = useState<"mine" | "templates">("mine");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const { data: mineRes, isLoading: loadingMine, mutate: loadMine } = useSWR(
    businessId ? `/api/design/designs?businessId=${businessId}&isTemplate=false` : null
  );
  const { data: tplRes, isLoading: loadingTpl, mutate: loadTemplates } = useSWR(
    businessId ? `/api/design/designs?businessId=${businessId}&isTemplate=true` : null
  );
  const designs: DesignCard[] = mineRes?.success ? mineRes.designs : [];
  const templates: DesignCard[] = tplRes?.success ? tplRes.designs : [];
  const loading = loadingMine || loadingTpl;

  function load() {
    loadMine();
    loadTemplates();
  }

  const handleDuplicate = async (design: DesignCard) => {
    if (!businessId) return;
    try {
      const res = await fetch(`/api/design/designs/${design._id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || "Failed to duplicate design.", false);
        return;
      }
      showToast("Design duplicated.");
      window.location.href = `/admin/design-studio/editor/${data.design._id}`;
    } catch {
      showToast("Network error.", false);
    }
  };

  const handleDelete = async (design: DesignCard) => {
    if (!window.confirm(`Delete "${design.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/design/designs/${design._id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || "Failed to delete design.", false);
        return;
      }
      showToast("Design deleted.");
      load();
    } catch {
      showToast("Network error.", false);
    }
  };

  const list = tab === "mine" ? designs : templates;

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
          <h1 className="text-xl font-semibold text-gray-900">Design Studio</h1>
          <p className="text-sm text-gray-500 mt-0.5 max-w-2xl">
            Design labels, logos and social graphics on a canvas, save reusable components, and
            export to PNG, JPG, PDF or SVG.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/admin/design-studio/assets"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:border-gray-400 hover:text-gray-900"
          >
            <ImageIcon size={16} />
            Asset Library
          </Link>
          <Link
            href="/admin/design-studio/editor"
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800"
          >
            <Plus size={16} />
            New Design
          </Link>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab("mine")}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition ${tab === "mine" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
        >
          My Designs
        </button>
        <button
          onClick={() => setTab("templates")}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition ${tab === "templates" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
        >
          Templates
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-gray-500 text-sm">Loading…</div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center">
          <Palette className="mx-auto text-gray-300" size={32} />
          <p className="mt-3 text-sm font-medium text-gray-700">
            {tab === "mine" ? "No designs yet" : "No templates yet"}
          </p>
          <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
            {tab === "mine"
              ? "Start a new design and it will show up here."
              : "Designs marked as a template will show here as shared starting points."}
          </p>
          {tab === "mine" && (
            <Link
              href="/admin/design-studio/editor"
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800"
            >
              <Plus size={14} /> New Design
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {list.map((d) => {
            const thumb = d.thumbnailAssetId?.thumbnailUrl || d.thumbnailAssetId?.fileUrl;
            return (
              <div key={d._id} className="rounded-2xl border border-gray-200 bg-white overflow-hidden group">
                <div className="aspect-[4/3] bg-gray-50 flex items-center justify-center overflow-hidden">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt={d.name} className="w-full h-full object-contain" />
                  ) : (
                    <FolderOpen className="text-gray-300" size={28} />
                  )}
                </div>
                <div className="p-3 space-y-2">
                  <p className="text-sm font-medium text-gray-900 truncate" title={d.name}>
                    {d.name}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {d.canvasWidth}×{d.canvasHeight}px · {new Date(d.updatedAt).toLocaleDateString()}
                  </p>
                  <div className="flex items-center gap-1.5 pt-1">
                    {tab === "mine" ? (
                      <Link
                        href={`/admin/design-studio/editor/${d._id}`}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:border-gray-400"
                      >
                        <Pencil size={12} /> Open
                      </Link>
                    ) : (
                      <button
                        onClick={() => handleDuplicate(d)}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:border-gray-400"
                      >
                        <Copy size={12} /> Use Template
                      </button>
                    )}
                    <button
                      onClick={() => handleDuplicate(d)}
                      title="Duplicate"
                      className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:border-gray-400"
                    >
                      <Copy size={12} />
                    </button>
                    {tab === "mine" && (
                      <button
                        onClick={() => handleDelete(d)}
                        title="Delete"
                        className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-red-500 hover:border-red-300"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
