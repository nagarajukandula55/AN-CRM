"use client";

/**
 * The Design Studio canvas editor. Fabric.js (v6, ESM/named-export style —
 * `import { Canvas, Rect, ... } from "fabric"`) is loaded via a dynamic
 * `import("fabric")` inside a useEffect, never at module top level, since
 * Fabric touches `document`/`window` at import time and Next.js's
 * server-side build/prerender would otherwise fail with
 * "document is not defined". The page files that render this component
 * additionally load it through `next/dynamic` with `ssr:false` as a second
 * layer of protection.
 *
 * Fabric object types are treated as `any` throughout — Fabric v6's own
 * TypeScript types are deep and this editor only needs a handful of
 * well-known properties off each object, so fighting the full type surface
 * would add a lot of ceremony for no real safety benefit here.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HexColorPicker } from "react-colorful";
import jsPDF from "jspdf";
import {
  Type,
  Square,
  Circle as CircleIcon,
  Minus,
  ImagePlus,
  Undo2,
  Redo2,
  Trash2,
  Copy,
  BringToFront,
  SendToBack,
  ZoomIn,
  ZoomOut,
  Maximize,
  Save,
  Download,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ArrowUp,
  ArrowDown,
  X,
  CheckCircle,
  AlertCircle,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Library,
} from "lucide-react";
import { DESIGN_SIZE_PRESETS, type SizePreset } from "@/core/design/sizePresets";
import { downloadDataUrl, downloadTextFile, dataUrlToBlob, pxToMm } from "@/core/design/exportUtils";
import { DESIGN_COMPONENT_CATEGORIES, type DesignComponentCategory } from "@/core/design/componentCategories";
import { useActiveBusinessId } from "@/hooks/useActiveBusinessId";

const FONT_FAMILIES = [
  "Arial",
  "Helvetica",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Verdana",
  "Trebuchet MS",
  "Impact",
];

interface DesignComponentOption {
  _id: string;
  name: string;
  category: DesignComponentCategory;
  assetId?: { fileUrl?: string; thumbnailUrl?: string };
}

interface DesignEditorProps {
  /** Existing design id — loads it and edits in place. */
  designId?: string;
  /** If set, the given template design id is duplicated first, then edited as the new private copy. */
  duplicateFromTemplateId?: string;
}

export default function DesignEditor({ designId, duplicateFromTemplateId }: DesignEditorProps) {
  const router = useRouter();
  const { businessId } = useActiveBusinessId();

  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<any>(null); // the imported fabric module
  const canvasRef = useRef<any>(null); // the live Fabric Canvas instance
  const historyRef = useRef<{ stack: string[]; index: number; suspend: boolean }>({
    stack: [],
    index: -1,
    suspend: false,
  });

  const [fabricReady, setFabricReady] = useState(false);
  const [needsSizePicker, setNeedsSizePicker] = useState(!designId && !duplicateFromTemplateId);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(
    designId || duplicateFromTemplateId ? null : null
  );
  const [designName, setDesignName] = useState("Untitled Design");
  const [existingDesignId, setExistingDesignId] = useState<string | null>(designId || null);
  const [initialCanvasJson, setInitialCanvasJson] = useState<any>(null);
  const [loadingInitial, setLoadingInitial] = useState(!!(designId || duplicateFromTemplateId));

  const [selected, setSelected] = useState<any>(null);
  const [, forceTick] = useState(0);
  const rerender = () => forceTick((t) => t + 1);

  const [zoom, setZoom] = useState(1);
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryComponents, setLibraryComponents] = useState<DesignComponentOption[]>([]);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [jpgBgOpen, setJpgBgOpen] = useState(false);
  const [jpgBg, setJpgBg] = useState("#ffffff");

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  // ---- Resolve initial design (existing / duplicated-from-template) ----
  useEffect(() => {
    async function resolveInitial() {
      if (duplicateFromTemplateId && businessId) {
        try {
          const res = await fetch(`/api/design/designs/${duplicateFromTemplateId}/duplicate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ businessId }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            setExistingDesignId(data.design._id);
            setDesignName(data.design.name);
            setCanvasSize({ width: data.design.canvasWidth, height: data.design.canvasHeight });
            setInitialCanvasJson(data.design.canvasJson);
            setNeedsSizePicker(false);
            router.replace(`/admin/design-studio/editor/${data.design._id}`);
          } else {
            showToast(data.error || "Failed to start from template.", false);
          }
        } finally {
          setLoadingInitial(false);
        }
        return;
      }
      if (designId) {
        try {
          const res = await fetch(`/api/design/designs/${designId}`);
          const data = await res.json();
          if (res.ok && data.success) {
            setDesignName(data.design.name);
            setCanvasSize({ width: data.design.canvasWidth, height: data.design.canvasHeight });
            setInitialCanvasJson(data.design.canvasJson);
            setNeedsSizePicker(false);
          } else {
            showToast(data.error || "Failed to load design.", false);
          }
        } finally {
          setLoadingInitial(false);
        }
      }
    }
    if (designId || duplicateFromTemplateId) resolveInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designId, duplicateFromTemplateId, businessId]);

  // ---- Mount Fabric canvas once size is known ----
  useEffect(() => {
    if (!canvasSize || fabricReady) return;
    let cancelled = false;

    (async () => {
      const fabricModule = await import("fabric");
      if (cancelled) return;
      fabricRef.current = fabricModule;

      const canvasEl = canvasElRef.current;
      if (!canvasEl) return;

      const canvas = new fabricModule.Canvas(canvasEl, {
        width: canvasSize.width,
        height: canvasSize.height,
        backgroundColor: "#ffffff",
        preserveObjectStacking: true,
      });
      canvasRef.current = canvas;

      if (initialCanvasJson) {
        await canvas.loadFromJSON(initialCanvasJson);
        canvas.renderAll();
      }

      pushHistory();

      const onChange = () => {
        if (!historyRef.current.suspend) pushHistory();
        rerender();
      };
      canvas.on("object:added", onChange);
      canvas.on("object:removed", onChange);
      canvas.on("object:modified", onChange);
      canvas.on("selection:created", (e: any) => setSelected(e.selected?.[0] || null));
      canvas.on("selection:updated", (e: any) => setSelected(e.selected?.[0] || null));
      canvas.on("selection:cleared", () => setSelected(null));

      setFabricReady(true);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasSize, initialCanvasJson]);

  useEffect(() => {
    return () => {
      canvasRef.current?.dispose?.();
    };
  }, []);

  function pushHistory() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const json = JSON.stringify(canvas.toJSON());
    const h = historyRef.current;
    // Drop any redo-able future when a fresh change happens.
    h.stack = h.stack.slice(0, h.index + 1);
    h.stack.push(json);
    h.index = h.stack.length - 1;
  }

  const undo = useCallback(() => {
    const canvas = canvasRef.current;
    const h = historyRef.current;
    if (!canvas || h.index <= 0) return;
    h.index -= 1;
    h.suspend = true;
    canvas.loadFromJSON(JSON.parse(h.stack[h.index])).then(() => {
      canvas.renderAll();
      h.suspend = false;
      rerender();
    });
  }, []);

  const redo = useCallback(() => {
    const canvas = canvasRef.current;
    const h = historyRef.current;
    if (!canvas || h.index >= h.stack.length - 1) return;
    h.index += 1;
    h.suspend = true;
    canvas.loadFromJSON(JSON.parse(h.stack[h.index])).then(() => {
      canvas.renderAll();
      h.suspend = false;
      rerender();
    });
  }, []);

  // ---- Toolbar actions ----
  const addText = () => {
    const fabricModule = fabricRef.current;
    const canvas = canvasRef.current;
    if (!fabricModule || !canvas) return;
    const text = new fabricModule.IText("Double-click to edit", {
      left: 40,
      top: 40,
      fontFamily: "Arial",
      fontSize: 32,
      fill: "#111827",
    });
    (text as any).name = "Text";
    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.renderAll();
  };

  const addRect = () => {
    const fabricModule = fabricRef.current;
    const canvas = canvasRef.current;
    if (!fabricModule || !canvas) return;
    const rect = new fabricModule.Rect({
      left: 60,
      top: 60,
      width: 160,
      height: 100,
      fill: "#3b82f6",
      rx: 0,
      ry: 0,
    });
    (rect as any).name = "Rectangle";
    canvas.add(rect);
    canvas.setActiveObject(rect);
    canvas.renderAll();
  };

  const addCircle = () => {
    const fabricModule = fabricRef.current;
    const canvas = canvasRef.current;
    if (!fabricModule || !canvas) return;
    const circle = new fabricModule.Ellipse({
      left: 80,
      top: 80,
      rx: 70,
      ry: 70,
      fill: "#10b981",
    });
    (circle as any).name = "Circle";
    canvas.add(circle);
    canvas.setActiveObject(circle);
    canvas.renderAll();
  };

  const addLine = () => {
    const fabricModule = fabricRef.current;
    const canvas = canvasRef.current;
    if (!fabricModule || !canvas) return;
    const line = new fabricModule.Line([50, 50, 250, 50], {
      stroke: "#111827",
      strokeWidth: 4,
    });
    (line as any).name = "Line";
    canvas.add(line);
    canvas.setActiveObject(line);
    canvas.renderAll();
  };

  const addImageFromUrl = useCallback(async (url: string, name = "Image") => {
    const fabricModule = fabricRef.current;
    const canvas = canvasRef.current;
    if (!fabricModule || !canvas) return;
    const img = await fabricModule.FabricImage.fromURL(url, { crossOrigin: "anonymous" });
    img.set({ left: 50, top: 50 });
    if (img.width && img.width > canvas.width * 0.8) {
      const scale = (canvas.width * 0.6) / img.width;
      img.scale(scale);
    }
    (img as any).name = name;
    canvas.add(img);
    canvas.setActiveObject(img);
    canvas.renderAll();
  }, []);

  const handleUploadImage = async (file: File) => {
    if (!businessId) return;
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
      await addImageFromUrl(data.asset.fileUrl, data.asset.name);
    } catch {
      showToast("Network error.", false);
    }
  };

  const openLibrary = async () => {
    if (!businessId) return;
    setShowLibrary(true);
    const res = await fetch(`/api/design/components?businessId=${businessId}`);
    const data = await res.json();
    if (data.success) setLibraryComponents(data.components || []);
  };

  const deleteSelected = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObjects();
    active.forEach((o: any) => canvas.remove(o));
    canvas.discardActiveObject();
    canvas.renderAll();
  };

  const duplicateSelected = async () => {
    const canvas = canvasRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !active) return;
    const clone = await active.clone();
    clone.set({ left: (active.left || 0) + 20, top: (active.top || 0) + 20 });
    canvas.add(clone);
    canvas.setActiveObject(clone);
    canvas.renderAll();
  };

  const bringToFront = () => {
    const canvas = canvasRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !active) return;
    canvas.bringObjectToFront(active);
    canvas.renderAll();
    rerender();
  };
  const sendToBack = () => {
    const canvas = canvasRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !active) return;
    canvas.sendObjectToBack(active);
    canvas.renderAll();
    rerender();
  };

  const applyZoom = (next: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const z = Math.max(0.1, Math.min(3, next));
    canvas.setZoom(z);
    setZoom(z);
  };

  const fitZoom = () => {
    const canvas = canvasRef.current;
    const wrapper = canvasElRef.current?.parentElement;
    if (!canvas || !wrapper || !canvasSize) return;
    const availableW = wrapper.clientWidth - 40;
    const z = Math.max(0.1, Math.min(1, availableW / canvasSize.width));
    canvas.setZoom(z);
    setZoom(z);
  };

  // ---- Layers ----
  const layers = canvasRef.current ? [...canvasRef.current.getObjects()].reverse() : [];

  const selectLayer = (obj: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setActiveObject(obj);
    canvas.renderAll();
    setSelected(obj);
  };

  const toggleVisible = (obj: any) => {
    obj.visible = !obj.visible;
    canvasRef.current?.renderAll();
    rerender();
  };

  const toggleLock = (obj: any) => {
    const lock = !obj.lockMovementX;
    obj.lockMovementX = lock;
    obj.lockMovementY = lock;
    obj.lockScalingX = lock;
    obj.lockScalingY = lock;
    obj.lockRotation = lock;
    obj.selectable = !lock;
    obj.evented = true;
    canvasRef.current?.renderAll();
    rerender();
  };

  const moveLayerUp = (obj: any) => {
    canvasRef.current?.bringObjectForward(obj);
    canvasRef.current?.renderAll();
    rerender();
  };
  const moveLayerDown = (obj: any) => {
    canvasRef.current?.sendObjectBackwards(obj);
    canvasRef.current?.renderAll();
    rerender();
  };
  const renameLayer = (obj: any) => {
    const name = window.prompt("Rename layer", obj.name || "");
    if (name === null) return;
    obj.name = name;
    rerender();
  };
  const deleteLayer = (obj: any) => {
    canvasRef.current?.remove(obj);
    canvasRef.current?.renderAll();
    if (selected === obj) setSelected(null);
    rerender();
  };

  // ---- Properties panel updates ----
  const updateSelected = (props: Record<string, any>) => {
    const canvas = canvasRef.current;
    if (!canvas || !selected) return;
    selected.set(props);
    canvas.renderAll();
    rerender();
  };

  // ---- Save ----
  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !canvasSize || !businessId) return;
    setSaving(true);
    try {
      const canvasJson = canvas.toJSON();
      const thumbDataUrl = canvas.toDataURL({ format: "png", multiplier: 0.2 });
      const blob = dataUrlToBlob(thumbDataUrl);
      const fd = new FormData();
      fd.append("file", blob, "thumbnail.png");
      fd.append("name", `${designName} thumbnail`);
      fd.append("category", "design-thumbnail");
      const thumbRes = await fetch("/api/assets/upload", { method: "POST", body: fd });
      const thumbData = await thumbRes.json();
      const thumbnailAssetId = thumbRes.ok && thumbData.success ? thumbData.asset._id : undefined;

      const payload = {
        businessId,
        name: designName || "Untitled Design",
        canvasWidth: canvasSize.width,
        canvasHeight: canvasSize.height,
        canvasJson,
        thumbnailAssetId,
      };

      if (existingDesignId) {
        const res = await fetch(`/api/design/designs/${existingDesignId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showToast(data.error || "Failed to save.", false);
          return;
        }
        showToast("Design saved.");
      } else {
        const res = await fetch("/api/design/designs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showToast(data.error || "Failed to save.", false);
          return;
        }
        showToast("Design saved.");
        setExistingDesignId(data.design._id);
        router.replace(`/admin/design-studio/editor/${data.design._id}`);
      }
    } catch {
      showToast("Network error.", false);
    } finally {
      setSaving(false);
    }
  };

  // ---- Export ----
  const exportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL({ format: "png" });
    downloadDataUrl(dataUrl, `${designName || "design"}.png`);
    setShowExportMenu(false);
  };

  const exportJpg = (bg: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const prevBg = canvas.backgroundColor;
    canvas.backgroundColor = bg;
    canvas.renderAll();
    const dataUrl = canvas.toDataURL({ format: "jpeg", quality: 0.92 });
    canvas.backgroundColor = prevBg;
    canvas.renderAll();
    downloadDataUrl(dataUrl, `${designName || "design"}.jpg`);
    setJpgBgOpen(false);
    setShowExportMenu(false);
  };

  const exportSvg = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const svg = canvas.toSVG();
    downloadTextFile(svg, `${designName || "design"}.svg`);
    setShowExportMenu(false);
  };

  const exportPdf = () => {
    const canvas = canvasRef.current;
    if (!canvas || !canvasSize) return;
    const dataUrl = canvas.toDataURL({ format: "png" });
    const widthMm = pxToMm(canvasSize.width);
    const heightMm = pxToMm(canvasSize.height);
    const doc = new jsPDF({
      orientation: widthMm >= heightMm ? "landscape" : "portrait",
      unit: "mm",
      format: [widthMm, heightMm],
    });
    doc.addImage(dataUrl, "PNG", 0, 0, widthMm, heightMm);
    doc.save(`${designName || "design"}.pdf`);
    setShowExportMenu(false);
  };

  // ---- Size picker (before mount) ----
  if (needsSizePicker) {
    return (
      <SizePickerScreen
        onPick={(size) => {
          setCanvasSize(size);
          setNeedsSizePicker(false);
        }}
      />
    );
  }

  if (loadingInitial || (!canvasSize && !needsSizePicker)) {
    return <div className="p-12 text-center text-gray-500 text-sm">Loading…</div>;
  }

  return (
    <div className="h-[calc(100vh-0px)] flex flex-col bg-gray-50">
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

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <input
            value={designName}
            onChange={(e) => setDesignName(e.target.value)}
            className="text-sm font-semibold text-gray-900 border border-transparent hover:border-gray-200 focus:border-gray-400 rounded-lg px-2 py-1 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            <Save size={13} /> {saving ? "Saving…" : "Save"}
          </button>
          <div className="relative">
            <button
              onClick={() => setShowExportMenu((s) => !s)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:border-gray-400"
            >
              <Download size={13} /> Export
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-20">
                <button onClick={exportPng} className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                  PNG
                </button>
                <button
                  onClick={() => setJpgBgOpen(true)}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                >
                  JPG
                </button>
                <button onClick={exportSvg} className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                  SVG
                </button>
                <button onClick={exportPdf} className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                  PDF
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {jpgBgOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-xs bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-sm font-semibold text-gray-900">JPG Background</h3>
              <button onClick={() => setJpgBgOpen(false)} className="text-gray-500 hover:text-gray-900">
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-gray-500">JPG has no transparency — pick a background color.</p>
              <HexColorPicker color={jpgBg} onChange={setJpgBg} style={{ width: "100%" }} />
              <button
                onClick={() => exportJpg(jpgBg)}
                className="w-full px-3 py-2 bg-gray-900 text-white rounded-xl text-xs font-medium hover:bg-gray-800"
              >
                Export JPG
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-200 bg-white shrink-0 overflow-x-auto">
        <ToolButton icon={<Type size={15} />} label="Text" onClick={addText} />
        <ToolButton icon={<Square size={15} />} label="Rectangle" onClick={addRect} />
        <ToolButton icon={<CircleIcon size={15} />} label="Circle" onClick={addCircle} />
        <ToolButton icon={<Minus size={15} />} label="Line" onClick={addLine} />
        <label className="cursor-pointer">
          <ToolButton icon={<ImagePlus size={15} />} label="Upload Image" onClick={() => {}} asLabel />
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUploadImage(file);
              e.target.value = "";
            }}
          />
        </label>
        <ToolButton icon={<Library size={15} />} label="From Library" onClick={openLibrary} />
        <Divider />
        <ToolButton icon={<Undo2 size={15} />} label="Undo" onClick={undo} />
        <ToolButton icon={<Redo2 size={15} />} label="Redo" onClick={redo} />
        <Divider />
        <ToolButton icon={<Copy size={15} />} label="Duplicate" onClick={duplicateSelected} disabled={!selected} />
        <ToolButton icon={<Trash2 size={15} />} label="Delete" onClick={deleteSelected} disabled={!selected} />
        <ToolButton icon={<BringToFront size={15} />} label="Front" onClick={bringToFront} disabled={!selected} />
        <ToolButton icon={<SendToBack size={15} />} label="Back" onClick={sendToBack} disabled={!selected} />
        <Divider />
        <ToolButton icon={<ZoomOut size={15} />} label="Zoom Out" onClick={() => applyZoom(zoom - 0.1)} />
        <span className="text-xs text-gray-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
        <ToolButton icon={<ZoomIn size={15} />} label="Zoom In" onClick={() => applyZoom(zoom + 0.1)} />
        <ToolButton icon={<Maximize size={15} />} label="Fit" onClick={fitZoom} />
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Layers panel */}
        <div className="w-56 border-r border-gray-200 bg-white overflow-y-auto shrink-0">
          <div className="px-3 py-2.5 border-b border-gray-100 text-xs font-semibold text-gray-700">Layers</div>
          <div className="p-2 space-y-1">
            {layers.length === 0 && <p className="text-[11px] text-gray-400 px-2 py-3">No objects yet.</p>}
            {layers.map((obj: any, i: number) => (
              <div
                key={i}
                onClick={() => selectLayer(obj)}
                className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs cursor-pointer border ${
                  selected === obj ? "border-gray-400 bg-gray-50" : "border-transparent hover:bg-gray-50"
                }`}
              >
                <span className="flex-1 truncate text-gray-700" title={obj.name || obj.type}>
                  {obj.name || obj.type}
                </span>
                <button onClick={(e) => { e.stopPropagation(); moveLayerUp(obj); }} title="Move up" className="text-gray-400 hover:text-gray-700">
                  <ArrowUp size={11} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); moveLayerDown(obj); }} title="Move down" className="text-gray-400 hover:text-gray-700">
                  <ArrowDown size={11} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); toggleVisible(obj); }} title="Toggle visibility" className="text-gray-400 hover:text-gray-700">
                  {obj.visible === false ? <EyeOff size={11} /> : <Eye size={11} />}
                </button>
                <button onClick={(e) => { e.stopPropagation(); toggleLock(obj); }} title="Toggle lock" className="text-gray-400 hover:text-gray-700">
                  {obj.lockMovementX ? <Lock size={11} /> : <Unlock size={11} />}
                </button>
                <button onClick={(e) => { e.stopPropagation(); renameLayer(obj); }} title="Rename" className="text-gray-400 hover:text-gray-700">
                  <Type size={11} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); deleteLayer(obj); }} title="Delete" className="text-gray-400 hover:text-red-500">
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-6">
          <div className="shadow-lg" style={{ background: "#fff" }}>
            <canvas ref={canvasElRef} />
          </div>
        </div>

        {/* Properties panel */}
        <div className="w-64 border-l border-gray-200 bg-white overflow-y-auto shrink-0">
          <div className="px-3 py-2.5 border-b border-gray-100 text-xs font-semibold text-gray-700">Properties</div>
          {!selected ? (
            <p className="text-[11px] text-gray-400 px-3 py-3">Select an object to edit its properties.</p>
          ) : (
            <PropertiesPanel selected={selected} onChange={updateSelected} />
          )}
        </div>
      </div>

      {/* Component library side panel */}
      {showLibrary && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setShowLibrary(false)}>
          <div className="w-80 bg-white h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
              <h3 className="text-sm font-semibold text-gray-900">Component Library</h3>
              <button onClick={() => setShowLibrary(false)} className="text-gray-500 hover:text-gray-900">
                <X size={16} />
              </button>
            </div>
            <div className="p-3 grid grid-cols-2 gap-2">
              {libraryComponents.length === 0 && (
                <p className="col-span-2 text-[11px] text-gray-400 py-6 text-center">No components saved yet.</p>
              )}
              {libraryComponents.map((c) => (
                <button
                  key={c._id}
                  onClick={async () => {
                    const url = c.assetId?.fileUrl;
                    if (url) await addImageFromUrl(url, c.name);
                    setShowLibrary(false);
                  }}
                  className="rounded-xl border border-gray-200 overflow-hidden hover:border-gray-400 text-left"
                >
                  <div className="aspect-square bg-gray-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.assetId?.thumbnailUrl || c.assetId?.fileUrl} alt={c.name} className="w-full h-full object-contain" />
                  </div>
                  <p className="text-[11px] px-2 py-1.5 truncate text-gray-700">{c.name}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-gray-200 mx-1" />;
}

function ToolButton({
  icon,
  label,
  onClick,
  disabled,
  asLabel,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  asLabel?: boolean;
}) {
  const cls = `flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-transparent text-gray-600 hover:border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none shrink-0`;
  if (asLabel) {
    return (
      <span className={cls} title={label}>
        {icon}
      </span>
    );
  }
  return (
    <button onClick={onClick} disabled={disabled} title={label} className={cls}>
      {icon}
    </button>
  );
}

function SizePickerScreen({ onPick }: { onPick: (size: { width: number; height: number }) => void }) {
  const [custom, setCustom] = useState({ width: 800, height: 600 });
  const [showCustom, setShowCustom] = useState(false);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">New Design</h1>
      <p className="text-sm text-gray-500 mb-6">Pick a canvas size to start with.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {DESIGN_SIZE_PRESETS.map((p: SizePreset) => (
          <button
            key={p.key}
            onClick={() => onPick({ width: p.width, height: p.height })}
            className="text-left p-4 rounded-2xl border border-gray-200 bg-white hover:border-gray-400 transition"
          >
            <p className="text-sm font-medium text-gray-900">{p.label}</p>
            <p className="text-xs text-gray-400 mt-1">{p.description}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {p.width} × {p.height}px
            </p>
          </button>
        ))}
        <button
          onClick={() => setShowCustom(true)}
          className="text-left p-4 rounded-2xl border border-dashed border-gray-300 bg-white hover:border-gray-400 transition"
        >
          <p className="text-sm font-medium text-gray-900">Custom</p>
          <p className="text-xs text-gray-400 mt-1">Set your own pixel dimensions</p>
        </button>
      </div>

      {showCustom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-xs bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-sm font-semibold text-gray-900">Custom Size</h3>
              <button onClick={() => setShowCustom(false)} className="text-gray-500 hover:text-gray-900">
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Width (px)</label>
                <input
                  type="number"
                  value={custom.width}
                  onChange={(e) => setCustom({ ...custom, width: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-gray-400"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Height (px)</label>
                <input
                  type="number"
                  value={custom.height}
                  onChange={(e) => setCustom({ ...custom, height: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-gray-400"
                />
              </div>
              <button
                onClick={() => {
                  if (custom.width > 0 && custom.height > 0) onPick(custom);
                }}
                className="w-full px-3 py-2 bg-gray-900 text-white rounded-xl text-xs font-medium hover:bg-gray-800"
              >
                Create Design
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PropertiesPanel({ selected, onChange }: { selected: any; onChange: (props: Record<string, any>) => void }) {
  const [showFillPicker, setShowFillPicker] = useState(false);
  const [showStrokePicker, setShowStrokePicker] = useState(false);
  const type = selected.type as string;
  const isText = type === "i-text" || type === "textbox" || type === "text";
  const isImage = type === "image";
  const isRect = type === "rect";

  return (
    <div className="p-3 space-y-4">
      {/* Position/size — common to all types */}
      <div>
        <p className="text-[11px] font-semibold text-gray-500 mb-1.5">Position &amp; Size</p>
        <div className="grid grid-cols-2 gap-2">
          <NumField label="X" value={Math.round(selected.left || 0)} onChange={(v) => onChange({ left: v })} />
          <NumField label="Y" value={Math.round(selected.top || 0)} onChange={(v) => onChange({ top: v })} />
          <NumField
            label="Width"
            value={Math.round((selected.width || 0) * (selected.scaleX || 1))}
            onChange={(v) => onChange({ scaleX: v / (selected.width || 1) })}
          />
          <NumField
            label="Height"
            value={Math.round((selected.height || 0) * (selected.scaleY || 1))}
            onChange={(v) => onChange({ scaleY: v / (selected.height || 1) })}
          />
          <NumField label="Rotation" value={Math.round(selected.angle || 0)} onChange={(v) => onChange({ angle: v })} />
        </div>
      </div>

      {isText && (
        <div>
          <p className="text-[11px] font-semibold text-gray-500 mb-1.5">Text</p>
          <select
            value={selected.fontFamily || "Arial"}
            onChange={(e) => onChange({ fontFamily: e.target.value })}
            className="w-full mb-2 px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-xs text-gray-700"
          >
            {FONT_FAMILIES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <NumField label="Font size" value={selected.fontSize || 24} onChange={(v) => onChange({ fontSize: v })} />
          <div className="flex items-center gap-1 mt-2">
            <button
              onClick={() => onChange({ fontWeight: selected.fontWeight === "bold" ? "normal" : "bold" })}
              className={`p-1.5 rounded-lg border ${selected.fontWeight === "bold" ? "border-gray-900 bg-gray-100" : "border-gray-200"}`}
            >
              <Bold size={13} />
            </button>
            <button
              onClick={() => onChange({ fontStyle: selected.fontStyle === "italic" ? "normal" : "italic" })}
              className={`p-1.5 rounded-lg border ${selected.fontStyle === "italic" ? "border-gray-900 bg-gray-100" : "border-gray-200"}`}
            >
              <Italic size={13} />
            </button>
            <button
              onClick={() => onChange({ underline: !selected.underline })}
              className={`p-1.5 rounded-lg border ${selected.underline ? "border-gray-900 bg-gray-100" : "border-gray-200"}`}
            >
              <Underline size={13} />
            </button>
            <div className="w-px h-5 bg-gray-200 mx-1" />
            <button
              onClick={() => onChange({ textAlign: "left" })}
              className={`p-1.5 rounded-lg border ${selected.textAlign === "left" ? "border-gray-900 bg-gray-100" : "border-gray-200"}`}
            >
              <AlignLeft size={13} />
            </button>
            <button
              onClick={() => onChange({ textAlign: "center" })}
              className={`p-1.5 rounded-lg border ${selected.textAlign === "center" ? "border-gray-900 bg-gray-100" : "border-gray-200"}`}
            >
              <AlignCenter size={13} />
            </button>
            <button
              onClick={() => onChange({ textAlign: "right" })}
              className={`p-1.5 rounded-lg border ${selected.textAlign === "right" ? "border-gray-900 bg-gray-100" : "border-gray-200"}`}
            >
              <AlignRight size={13} />
            </button>
          </div>
          <div className="mt-2">
            <button
              onClick={() => setShowFillPicker((s) => !s)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 w-full"
            >
              <span className="w-4 h-4 rounded border border-gray-300" style={{ background: selected.fill || "#000" }} />
              Text Color
            </button>
            {showFillPicker && (
              <div className="mt-2">
                <HexColorPicker color={selected.fill || "#000000"} onChange={(c) => onChange({ fill: c })} style={{ width: "100%" }} />
              </div>
            )}
          </div>
        </div>
      )}

      {!isText && !isImage && (
        <div>
          <p className="text-[11px] font-semibold text-gray-500 mb-1.5">Fill &amp; Stroke</p>
          <button
            onClick={() => setShowFillPicker((s) => !s)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 w-full mb-2"
          >
            <span className="w-4 h-4 rounded border border-gray-300" style={{ background: selected.fill || "#000" }} />
            Fill
          </button>
          {showFillPicker && (
            <div className="mb-2">
              <HexColorPicker color={selected.fill || "#000000"} onChange={(c) => onChange({ fill: c })} style={{ width: "100%" }} />
            </div>
          )}
          <button
            onClick={() => setShowStrokePicker((s) => !s)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 w-full mb-2"
          >
            <span className="w-4 h-4 rounded border border-gray-300" style={{ background: selected.stroke || "transparent" }} />
            Stroke
          </button>
          {showStrokePicker && (
            <div className="mb-2">
              <HexColorPicker color={selected.stroke || "#000000"} onChange={(c) => onChange({ stroke: c })} style={{ width: "100%" }} />
            </div>
          )}
          <NumField label="Stroke width" value={selected.strokeWidth || 0} onChange={(v) => onChange({ strokeWidth: v })} />
          {isRect && <NumField label="Corner radius" value={selected.rx || 0} onChange={(v) => onChange({ rx: v, ry: v })} />}
        </div>
      )}

      {isImage && (
        <div>
          <p className="text-[11px] font-semibold text-gray-500 mb-1.5">Image</p>
          <p className="text-[11px] text-gray-400">Use Delete + Add Image / From Library to replace this image.</p>
        </div>
      )}

      <div>
        <p className="text-[11px] font-semibold text-gray-500 mb-1.5">Opacity</p>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={selected.opacity ?? 1}
          onChange={(e) => onChange({ opacity: Number(e.target.value) })}
          className="w-full"
        />
      </div>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] text-gray-400 block mb-0.5">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-2 py-1 bg-white border border-gray-300 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-gray-400"
      />
    </label>
  );
}
