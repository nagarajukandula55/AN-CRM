"use client";

/**
 * Document Templates — unified viewer + drag-and-drop builder covering
 * every document type (invoice, PO, quotation, delivery challan, credit
 * note, proforma invoice). This is additive to (not a replacement for)
 * the existing /console/invoice-templates page, which stays as the branding
 * editor for the 3 fixed ecommerce invoice layouts. This page is for the
 * newer, generalized DocumentTemplate model — pick a document type, pick
 * or create a template, and reorder/configure its blocks via drag-and-drop.
 */

import { useState, useRef } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  FileText,
  Plus,
  Trash2,
  Star,
  Loader2,
  GripVertical,
  X,
  ExternalLink,
  Upload,
} from "lucide-react";
import { DocumentRenderer } from "@/core/documentTemplates/renderer";
import type { DocumentRenderData } from "@/core/documentTemplates/renderData";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface BlockPaletteEntry {
  type: string;
  label: string;
  description: string;
}

interface TemplateBlock {
  id: string;
  type: string;
  config?: Record<string, unknown>;
}

interface DocTemplate {
  _id: string;
  businessId: string;
  documentType: string;
  name: string;
  isDefault: boolean;
  blocks: TemplateBlock[];
  accentColor: string;
  logoUrl?: string;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  INVOICE: "Invoice",
  PURCHASE_ORDER: "Purchase Order",
  QUOTATION: "Quotation",
  DELIVERY_CHALLAN: "Delivery Challan",
  CREDIT_NOTE: "Credit Note",
  DEBIT_NOTE: "Debit Note",
  PROFORMA_INVOICE: "Proforma Invoice",
  WORK_ORDER: "Work Order",
  ESTIMATE: "Estimate",
  SALES_ORDER: "Sales Order",
  STOCK_TRANSFER: "Stock Transfer",
  STOCK_ADJUSTMENT: "Stock Adjustment",
  PRODUCTION_ORDER: "Production Order",
  GRN: "Goods Receipt (GRN)",
  SERVICE_RECORD: "Service Record",
};

// Representative sample data for the live preview -- pure client-side
// render of the in-progress blocks/accentColor/logoUrl, no round trip,
// so the preview updates the instant you reorder/edit a block.
const SAMPLE_RENDER_DATA: DocumentRenderData = {
  docTypeLabel: "SAMPLE DOCUMENT",
  docNumber: "SAMPLE-0001",
  date: "01 Jan 2026",
  status: "DRAFT",
  company: { name: "Your Business Name", address: "123 Business Street, City, State", gstin: "27AAAAA0000A1Z5" },
  party: { name: "Sample Customer", address: "456 Customer Lane, City, State", phone: "9876543210", email: "customer@example.com" },
  items: [
    { description: "Sample Item / Service", hsnCode: "1234", qty: 2, unit: "pcs", unitPrice: 500, taxRate: 18, amount: 1180 },
    { description: "Another Line Item", hsnCode: "5678", qty: 1, unit: "pcs", unitPrice: 1000, taxRate: 18, amount: 1180 },
  ],
  totals: { subtotal: 2000, tax: 360, grandTotal: 2360 },
  notes: "Sample terms and conditions appear here.",
};

function SortableBlock({
  block,
  palette,
  onRemove,
  onConfigChange,
}: {
  block: TemplateBlock;
  palette: BlockPaletteEntry[];
  onRemove: (id: string) => void;
  onConfigChange: (id: string, config: Record<string, unknown>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const entry = palette.find((p) => p.type === block.type);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 bg-white"
    >
      <button
        {...attributes}
        {...listeners}
        className="mt-1 text-gray-400 hover:text-gray-700 cursor-grab active:cursor-grabbing"
        title="Drag to reorder"
      >
        <GripVertical size={16} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-900">{entry?.label ?? block.type}</p>
          <button onClick={() => onRemove(block.id)} className="text-gray-400 hover:text-red-500">
            <X size={14} />
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{entry?.description}</p>
        {block.type === "custom-text" && (
          <textarea
            value={(block.config?.text as string) ?? ""}
            onChange={(e) => onConfigChange(block.id, { ...block.config, text: e.target.value })}
            placeholder="Enter custom text for this block…"
            rows={2}
            className="mt-2 w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400"
          />
        )}
        {block.type === "header" && (
          <input
            value={(block.config?.title as string) ?? ""}
            onChange={(e) => onConfigChange(block.id, { ...block.config, title: e.target.value })}
            placeholder={`Title, e.g. "TAX INVOICE"`}
            className="mt-2 w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400"
          />
        )}
        {block.type === "terms" && (
          <textarea
            value={(block.config?.text as string) ?? ""}
            onChange={(e) => onConfigChange(block.id, { ...block.config, text: e.target.value })}
            placeholder="Terms and conditions / footer note…"
            rows={2}
            className="mt-2 w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400"
          />
        )}
      </div>
    </div>
  );
}

export default function DocumentTemplatesPage() {
  const [documentType, setDocumentType] = useState<string>("INVOICE");
  const [selected, setSelected] = useState<DocTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  async function uploadLogo(file: File) {
    if (!selected) return;
    setUploadingLogo(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("name", `${selected.name} logo`);
      form.append("category", "logo");
      const res = await fetch("/api/assets/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!data.success || !data.asset?.fileUrl) {
        setError(data.message || "Failed to upload logo");
        return;
      }
      setSelected({ ...selected, logoUrl: data.asset.fileUrl });
    } finally {
      setUploadingLogo(false);
    }
  }

  const { data: meData } = useSWR("/api/auth/me");
  const businessId: string | null = meData ? (meData.user?.activeBusinessId || meData.businesses?.[0]?._id || null) : null;

  const { data: templatesRes, isLoading: loading, mutate: fetchTemplates } = useSWR(
    businessId ? `/api/document-templates?businessId=${businessId}&documentType=${documentType}` : null
  );
  const templates: DocTemplate[] = templatesRes?.success ? (templatesRes.templates || []) : [];
  const palette: BlockPaletteEntry[] = templatesRes?.success ? (templatesRes.blockPalette || []) : [];

  async function createTemplate() {
    if (!businessId) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/document-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          documentType,
          name: `${DOC_TYPE_LABELS[documentType] ?? documentType} Template ${templates.length + 1}`,
        }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error ?? "Failed to create template"); return; }
      await fetchTemplates();
      setSelected(data.data);
    } finally {
      setSaving(false);
    }
  }

  async function saveSelected() {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/document-templates/${selected._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selected.name,
          blocks: selected.blocks,
          accentColor: selected.accentColor,
          logoUrl: selected.logoUrl,
          isDefault: selected.isDefault,
        }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error ?? "Failed to save"); return; }
      await fetchTemplates();
    } finally {
      setSaving(false);
    }
  }

  async function deleteSelected() {
    if (!selected) return;
    if (!confirm(`Delete template "${selected.name}"?`)) return;
    setSaving(true);
    try {
      await fetch(`/api/document-templates/${selected._id}`, { method: "DELETE" });
      setSelected(null);
      await fetchTemplates();
    } finally {
      setSaving(false);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!selected) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = selected.blocks.findIndex((b) => b.id === active.id);
    const newIndex = selected.blocks.findIndex((b) => b.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    setSelected({ ...selected, blocks: arrayMove(selected.blocks, oldIndex, newIndex) });
  }

  function addBlock(type: string) {
    if (!selected) return;
    const id = `blk_new_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setSelected({ ...selected, blocks: [...selected.blocks, { id, type, config: {} }] });
  }

  function removeBlock(id: string) {
    if (!selected) return;
    setSelected({ ...selected, blocks: selected.blocks.filter((b) => b.id !== id) });
  }

  function updateBlockConfig(id: string, config: Record<string, unknown>) {
    if (!selected) return;
    setSelected({
      ...selected,
      blocks: selected.blocks.map((b) => (b.id === id ? { ...b, config } : b)),
    });
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Document Templates</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Drag and drop to design the layout of every document type — invoices, purchase orders, quotations, and more.
          </p>
        </div>
        <Link
          href="/console/admin/invoice-templates"
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl hover:text-gray-900 hover:border-gray-400"
        >
          Ecommerce invoice branding editor <ExternalLink size={12} />
        </Link>
      </div>

      {/* Document type tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {Object.entries(DOC_TYPE_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setDocumentType(key); setSelected(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              documentType === key
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Template list */}
        <div className="lg:col-span-1 space-y-3">
          <button
            onClick={createTemplate}
            disabled={saving || !businessId}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-60"
          >
            <Plus size={16} />
            New {DOC_TYPE_LABELS[documentType]} Template
          </button>

          {loading ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              <Loader2 className="animate-spin mx-auto mb-2" size={20} />
              Loading…
            </div>
          ) : templates.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm border border-dashed border-gray-200 rounded-xl">
              No {DOC_TYPE_LABELS[documentType].toLowerCase()} templates yet.
            </div>
          ) : (
            templates.map((t) => (
              <button
                key={t._id}
                onClick={() => setSelected(t)}
                className={`w-full text-left p-3 rounded-xl border transition-colors ${
                  selected?._id === t._id
                    ? "border-gray-400 bg-gray-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-gray-500" />
                    <span className="text-sm font-medium text-gray-900">{t.name}</span>
                  </div>
                  {t.isDefault && <Star size={13} className="text-amber-500 fill-amber-500" />}
                </div>
                <p className="text-xs text-gray-500 mt-1">{t.blocks?.length ?? 0} blocks</p>
              </button>
            ))
          )}
        </div>

        {/* Builder */}
        <div className="lg:col-span-2">
          {!selected ? (
            <div className="h-full min-h-[300px] flex items-center justify-center text-gray-500 text-sm border border-dashed border-gray-200 rounded-xl">
              Select or create a template to start designing its layout.
            </div>
          ) : (
            <div className="space-y-4">
              {error && (
                <div className="px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-500">
                  {error}
                </div>
              )}

              <div className="flex items-center gap-3 flex-wrap">
                <input
                  value={selected.name}
                  onChange={(e) => setSelected({ ...selected, name: e.target.value })}
                  className="flex-1 min-w-[180px] px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-900 focus:outline-none focus:border-gray-400"
                />
                <label className="flex items-center gap-1.5 text-xs text-gray-500">
                  <input
                    type="checkbox"
                    checked={selected.isDefault}
                    onChange={(e) => setSelected({ ...selected, isDefault: e.target.checked })}
                  />
                  Set as default
                </label>
                <input
                  type="color"
                  value={selected.accentColor}
                  onChange={(e) => setSelected({ ...selected, accentColor: e.target.value })}
                  className="w-9 h-9 rounded-lg border border-gray-200 cursor-pointer"
                  title="Accent color"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadLogo(file);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs border border-gray-200 rounded-lg text-gray-500 hover:text-gray-900 hover:border-gray-400 disabled:opacity-60"
                >
                  {uploadingLogo ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                  {selected.logoUrl ? "Change Logo" : "Upload Logo"}
                </button>
                {selected.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selected.logoUrl} alt="Logo" className="h-9 w-9 object-contain rounded border border-gray-200" />
                )}
              </div>

              {/* Block palette to add */}
              <div className="flex flex-wrap gap-2">
                {palette.map((p) => (
                  <button
                    key={p.type}
                    onClick={() => addBlock(p.type)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-gray-500 hover:text-gray-900"
                    title={p.description}
                  >
                    <Plus size={11} />
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Drag-and-drop block list */}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={selected.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {selected.blocks.map((block) => (
                      <SortableBlock
                        key={block.id}
                        block={block}
                        palette={palette}
                        onRemove={removeBlock}
                        onConfigChange={updateBlockConfig}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              {selected.blocks.length === 0 && (
                <div className="p-8 text-center text-gray-500 text-sm border border-dashed border-gray-200 rounded-xl">
                  No blocks yet — add some from the palette above.
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={deleteSelected}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs text-red-500 border border-red-200 rounded-xl hover:bg-red-50 disabled:opacity-60"
                >
                  <Trash2 size={13} />
                  Delete Template
                </button>
                <button
                  onClick={saveSelected}
                  disabled={saving}
                  className="px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save Template"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Live preview -- renders the in-progress blocks/accentColor/logoUrl
            with representative sample data via the same shared renderer the
            real print pages use, so what's shown here is what will print. */}
        <div className="lg:col-span-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400 mb-2">Preview</p>
          {selected ? (
            <div className="border border-gray-200 rounded-xl bg-white p-4 overflow-auto max-h-[80vh] text-[11px] scale-[0.85] origin-top">
              <DocumentRenderer
                blocks={selected.blocks}
                accentColor={selected.accentColor}
                logoUrl={selected.logoUrl}
                data={SAMPLE_RENDER_DATA}
              />
            </div>
          ) : (
            <div className="p-8 text-center text-gray-400 text-xs border border-dashed border-gray-200 rounded-xl">
              Select a template to preview it.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
