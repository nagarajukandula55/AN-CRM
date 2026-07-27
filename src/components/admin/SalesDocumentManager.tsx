"use client";

/**
 * Shared list + create UI for the 5 lightweight SalesDocument types
 * (Quotation, Delivery Challan, Credit Note, Debit Note, Proforma Invoice)
 * -- see models/SalesDocument.ts for why one model/component instead of
 * five near-identical copies. Each admin/<type>/page.tsx is a two-line
 * wrapper passing its docType + label here.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, X, Printer, Trash2, Loader2 } from "lucide-react";
import { validateGSTIN } from "@/lib/validation/gst";
import { useActiveBusinessId } from "@/hooks/useActiveBusinessId";
import { useToast } from "@/components/shared/Toast";

interface LineItem {
  description: string;
  hsnCode?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  taxRate: number;
}

interface SalesDoc {
  _id: string;
  docNumber: string;
  party: { name: string; address?: string; phone?: string; email?: string; gstin?: string };
  items: LineItem[];
  grandTotal: number;
  status: string;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-500",
  SENT: "bg-blue-100 text-blue-600",
  ACCEPTED: "bg-emerald-100 text-emerald-600",
  REJECTED: "bg-red-100 text-red-600",
  CANCELLED: "bg-gray-100 text-gray-400",
};

const EMPTY_ITEM: LineItem = { description: "", hsnCode: "", quantity: 1, unit: "pcs", unitPrice: 0, taxRate: 0 };

function fmt(n?: number) {
  return `₹${(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SalesDocumentManager({
  docType,
  label,
  pluralLabel,
}: {
  docType: string;
  label: string;
  pluralLabel: string;
}) {
  const { businessId } = useActiveBusinessId();
  const toast = useToast();

  const [docs, setDocs] = useState<SalesDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [party, setParty] = useState({ name: "", address: "", phone: "", email: "", gstin: "" });
  const [items, setItems] = useState<LineItem[]>([{ ...EMPTY_ITEM }]);
  const [notes, setNotes] = useState("");

  const fetchDocs = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/sales-documents?businessId=${businessId}&docType=${docType}`);
      const json = await res.json();
      if (json.success) setDocs(json.data || []);
    } finally {
      setLoading(false);
    }
  }, [businessId, docType]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  function resetForm() {
    setParty({ name: "", address: "", phone: "", email: "", gstin: "" });
    setItems([{ ...EMPTY_ITEM }]);
    setNotes("");
  }

  async function handleCreate() {
    if (!businessId) return;
    if (!party.name.trim()) {
      toast.error("Party name is required");
      return;
    }
    const validItems = items.filter((it) => it.description.trim());
    if (validItems.length === 0) {
      toast.error("Add at least one line item");
      return;
    }
    if (party.gstin?.trim()) {
      const result = validateGSTIN(party.gstin);
      if (!result.valid) {
        toast.error(`Party GSTIN: ${result.reason}`);
        return;
      }
    }
    setSaving(true);
    try {
      const res = await fetch("/api/sales-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, docType, party, items: validItems, notes }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.message || "Failed to create");
        return;
      }
      toast.success(`${label} ${json.data.docNumber} created`);
      setShowModal(false);
      resetForm();
      fetchDocs();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(`Delete this ${label.toLowerCase()}?`)) return;
    const res = await fetch(`/api/sales-documents/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.success) {
      toast.success("Deleted");
      fetchDocs();
    } else {
      toast.error(json.message || "Failed to delete");
    }
  }

  const previewTotal = items.reduce((s, it) => s + (it.quantity || 0) * (it.unitPrice || 0) * (1 + (it.taxRate || 0) / 100), 0);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{pluralLabel}</h1>
          <p className="text-sm text-gray-400">Create and print {pluralLabel.toLowerCase()} for this business.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-gray-800"
        >
          <Plus className="w-4 h-4" /> New {label}
        </button>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left px-6 py-3 text-gray-400 font-medium">Number</th>
              <th className="text-left px-6 py-3 text-gray-400 font-medium">Party</th>
              <th className="text-right px-6 py-3 text-gray-400 font-medium">Amount</th>
              <th className="text-center px-6 py-3 text-gray-400 font-medium">Status</th>
              <th className="text-gray-400 font-medium">Date</th>
              <th className="text-center px-6 py-3 text-gray-400 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></td></tr>
            ) : docs.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400">No {pluralLabel.toLowerCase()} yet</td></tr>
            ) : (
              docs.map((d) => (
                <tr key={d._id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-3 font-mono text-xs text-gray-500">{d.docNumber}</td>
                  <td className="px-6 py-3 text-gray-700">{d.party?.name}</td>
                  <td className="px-6 py-3 text-right text-gray-900">{fmt(d.grandTotal)}</td>
                  <td className="px-6 py-3 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[d.status] ?? "bg-gray-100 text-gray-500"}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-gray-400 text-xs">{new Date(d.createdAt).toLocaleDateString("en-IN")}</td>
                  <td className="px-6 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <Link
                        href={`/admin/sales-documents/${d._id}/print`}
                        target="_blank"
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                        title="Print"
                      >
                        <Printer className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => handleDelete(d._id)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">New {label}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">Party details</p>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    placeholder="Name *"
                    value={party.name}
                    onChange={(e) => setParty({ ...party, name: e.target.value })}
                    className="col-span-2 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                  <input
                    placeholder="Address"
                    value={party.address}
                    onChange={(e) => setParty({ ...party, address: e.target.value })}
                    className="col-span-2 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                  <input placeholder="Phone" value={party.phone} onChange={(e) => setParty({ ...party, phone: e.target.value })} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                  <input placeholder="Email" value={party.email} onChange={(e) => setParty({ ...party, email: e.target.value })} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                  <input placeholder="GSTIN" value={party.gstin} onChange={(e) => setParty({ ...party, gstin: e.target.value })} className="col-span-2 rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500">Line items</p>
                  <button
                    onClick={() => setItems([...items, { ...EMPTY_ITEM }])}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    + Add item
                  </button>
                </div>
                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-1.5 items-center">
                      <input
                        placeholder="Description"
                        value={it.description}
                        onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x)))}
                        className="col-span-5 rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                      />
                      <input
                        type="number"
                        placeholder="Qty"
                        value={it.quantity}
                        onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, quantity: Number(e.target.value) } : x)))}
                        className="col-span-2 rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                      />
                      <input
                        type="number"
                        placeholder="Rate"
                        value={it.unitPrice}
                        onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, unitPrice: Number(e.target.value) } : x)))}
                        className="col-span-2 rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                      />
                      <input
                        type="number"
                        placeholder="Tax %"
                        value={it.taxRate}
                        onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, taxRate: Number(e.target.value) } : x)))}
                        className="col-span-2 rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                      />
                      <button
                        onClick={() => setItems(items.filter((_, i) => i !== idx))}
                        className="col-span-1 text-gray-300 hover:text-red-500 flex justify-center"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-right text-sm font-semibold text-gray-700 mt-2">Total: {fmt(previewTotal)}</p>
              </div>

              <textarea
                placeholder="Notes / terms (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                rows={2}
              />
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800">
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? "Creating…" : `Create ${label}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
