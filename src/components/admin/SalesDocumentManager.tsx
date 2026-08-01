"use client";

/**
 * Shared list + create UI for the 5 lightweight SalesDocument types
 * (Quotation, Delivery Challan, Credit Note, Debit Note, Proforma Invoice)
 * -- see models/SalesDocument.ts for why one model/component instead of
 * five near-identical copies. Each admin/<type>/page.tsx is a two-line
 * wrapper passing its docType + label here.
 *
 * The create form was a compact, hand-rolled modal (free-text tax %, no
 * HSN input, no customer directory, no design-system tokens) -- rebuilt as
 * a full-page form matching the Sales Invoice creation screen's shape
 * (console/sales/new/page.tsx): browse/quick-add from the shared Customer
 * directory, a GST-slab dropdown per line (never free-text tax), HSN,
 * discount, and the same design-system components -- per explicit
 * direction ("Expand a full form just like invoice for Estimations,
 * Credit notes, debit notes Delivery challans and preforma").
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, X, Printer, Trash2, Loader2, Search } from "lucide-react";
import { validateGSTIN } from "@/lib/validation/gst";
import { useActiveBusinessId } from "@/hooks/useActiveBusinessId";
import { useToast } from "@/components/shared/Toast";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Field, Input, Select } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingPanel } from "@/components/ui/Spinner";
import { GST_SLABS } from "@/core/gst/gstSlabs";

interface LineItem {
  description: string;
  hsnCode?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  taxRate: number;
}

interface Party {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
  gstin?: string;
}

interface SalesDoc {
  _id: string;
  docNumber: string;
  party: Party;
  items: LineItem[];
  grandTotal: number;
  status: string;
  createdAt: string;
}

interface CustomerHit {
  _id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
}

const STATUS_TONE: Record<string, "neutral" | "info" | "success" | "danger"> = {
  DRAFT: "neutral",
  SENT: "info",
  ACCEPTED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

const EMPTY_ITEM: LineItem = { description: "", hsnCode: "", quantity: 1, unit: "pcs", unitPrice: 0, taxRate: 18 };

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
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [party, setParty] = useState<Party>({ name: "", address: "", city: "", state: "", phone: "", email: "", gstin: "" });
  const [items, setItems] = useState<LineItem[]>([{ ...EMPTY_ITEM }]);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [notes, setNotes] = useState("");

  // Customer browse/quick-add -- same shared directory used everywhere
  // else (Sales, Workorders, POS), so picking an existing customer here
  // fills the party fields instead of re-typing them, and any newly
  // entered party still lands in the same directory afterward.
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerHit[]>([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [showCustomerResults, setShowCustomerResults] = useState(false);

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

  useEffect(() => {
    if (!customerQuery.trim() || !businessId) {
      setCustomerResults([]);
      return;
    }
    setSearchingCustomers(true);
    const t = setTimeout(() => {
      fetch(`/api/customers?businessId=${businessId}&search=${encodeURIComponent(customerQuery)}`, { credentials: "include" })
        .then((r) => r.json())
        .then((d) => setCustomerResults(d.success ? d.customers || [] : []))
        .finally(() => setSearchingCustomers(false));
    }, 300);
    return () => clearTimeout(t);
  }, [customerQuery, businessId]);

  function pickCustomer(c: CustomerHit) {
    setParty({ name: c.name, phone: c.phone || "", email: c.email || "", address: c.address || "", city: c.city || "", state: c.state || "", gstin: "" });
    setCustomerQuery(c.name);
    setShowCustomerResults(false);
  }

  function resetForm() {
    setParty({ name: "", address: "", city: "", state: "", phone: "", email: "", gstin: "" });
    setItems([{ ...EMPTY_ITEM }]);
    setDiscountAmount(0);
    setNotes("");
    setCustomerQuery("");
  }

  function updateItem(idx: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
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
        body: JSON.stringify({ businessId, docType, party, items: validItems, discountAmount, notes }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.message || "Failed to create");
        return;
      }
      toast.success(`${label} ${json.data.docNumber} created`);
      setShowForm(false);
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

  const subtotal = items.reduce((s, it) => s + (it.quantity || 0) * (it.unitPrice || 0), 0);
  const taxTotal = items.reduce((s, it) => s + (it.quantity || 0) * (it.unitPrice || 0) * ((it.taxRate || 0) / 100), 0);
  const grandTotal = Math.max(0, subtotal + taxTotal - (discountAmount || 0));

  if (showForm) {
    return (
      <div className="min-h-screen bg-bg text-ink p-6 max-w-5xl mx-auto">
        <PageHeader
          title={`New ${label}`}
          description={`Create a ${label.toLowerCase()} for a customer or party.`}
          actions={
            <>
              <Button variant="secondary" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={saving} icon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}>
                {saving ? "Creating…" : `Create ${label}`}
              </Button>
            </>
          }
        />

        <Card className="p-5 mb-4 space-y-3">
          <div className="h-section">Party Details</div>
          <div className="relative">
            <Field label="Search customer directory or type a new name *">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3" />
                <Input
                  className="pl-8"
                  value={customerQuery || party.name}
                  onChange={(e) => { setCustomerQuery(e.target.value); setParty({ ...party, name: e.target.value }); setShowCustomerResults(true); }}
                  onFocus={() => setShowCustomerResults(true)}
                  placeholder="Start typing a name, phone, or email…"
                />
              </div>
            </Field>
            {showCustomerResults && customerQuery.trim() && (
              <div className="absolute z-20 mt-1 w-full rounded-card border border-border bg-surface shadow-card-lg max-h-56 overflow-y-auto">
                {searchingCustomers ? (
                  <div className="px-3 py-2 text-xs text-ink-3">Searching…</div>
                ) : customerResults.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-ink-3">No matches — this will be a new party.</div>
                ) : (
                  customerResults.map((c) => (
                    <button key={c._id} type="button" onClick={() => pickCustomer(c)} className="w-full text-left px-3 py-2 hover:bg-surface-2 text-sm">
                      <div className="text-ink">{c.name}</div>
                      <div className="text-xs text-ink-3">{[c.phone, c.email].filter(Boolean).join(" · ")}</div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Phone"><Input value={party.phone} onChange={(e) => setParty({ ...party, phone: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={party.email} onChange={(e) => setParty({ ...party, email: e.target.value })} /></Field>
            <Field label="Address" className="sm:col-span-2"><Input value={party.address} onChange={(e) => setParty({ ...party, address: e.target.value })} /></Field>
            <Field label="City"><Input value={party.city} onChange={(e) => setParty({ ...party, city: e.target.value })} /></Field>
            <Field label="State"><Input value={party.state} onChange={(e) => setParty({ ...party, state: e.target.value })} /></Field>
            <Field label="GSTIN (optional, for B2B)" className="sm:col-span-2"><Input value={party.gstin} onChange={(e) => setParty({ ...party, gstin: e.target.value })} placeholder="22AAAAA0000A1Z5" /></Field>
          </div>
        </Card>

        <Card className="overflow-hidden mb-4">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <div className="h-section">Line Items</div>
            <Button variant="secondary" size="sm" onClick={() => setItems([...items, { ...EMPTY_ITEM }])} icon={<Plus className="w-4 h-4" />}>Add Line</Button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2 text-xs text-ink-3 font-medium">Description</th>
                <th className="text-left px-2 py-2 text-xs text-ink-3 font-medium w-24">HSN</th>
                <th className="text-center px-2 py-2 text-xs text-ink-3 font-medium w-16">Qty</th>
                <th className="text-right px-2 py-2 text-xs text-ink-3 font-medium w-24">Rate</th>
                <th className="text-right px-2 py-2 text-xs text-ink-3 font-medium w-20">Tax %</th>
                <th className="text-right px-4 py-2 text-xs text-ink-3 font-medium w-28">Amount</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((it, idx) => {
                const lineTotal = (it.quantity || 0) * (it.unitPrice || 0) * (1 + (it.taxRate || 0) / 100);
                return (
                  <tr key={idx}>
                    <td className="px-4 py-1.5"><Input value={it.description} onChange={(e) => updateItem(idx, { description: e.target.value })} placeholder="Item / service" /></td>
                    <td className="px-2 py-1.5"><Input value={it.hsnCode} onChange={(e) => updateItem(idx, { hsnCode: e.target.value })} placeholder="8517" /></td>
                    <td className="px-2 py-1.5"><Input type="number" onFocus={(e) => e.target.select()} min={0} value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} className="text-center" /></td>
                    <td className="px-2 py-1.5"><Input type="number" onFocus={(e) => e.target.select()} min={0} value={it.unitPrice} onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) })} className="text-right" /></td>
                    <td className="px-2 py-1.5">
                      <Select value={it.taxRate} onChange={(e) => updateItem(idx, { taxRate: Number(e.target.value) })}>
                        {GST_SLABS.map((r) => <option key={r} value={r}>{r}%</option>)}
                      </Select>
                    </td>
                    <td className="px-4 py-1.5 text-right tabular text-ink font-medium">{fmt(lineTotal)}</td>
                    <td className="px-2 py-1.5">{items.length > 1 && (
                      <button onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-ink-3 hover:text-danger"><X className="w-4 h-4" /></button>
                    )}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <Card className="p-5">
            <Field label="Notes / Terms (optional)">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-border-strong resize-none" />
            </Field>
          </Card>
          <Card className="p-5 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-ink-3">Subtotal</span><span className="tabular text-ink">{fmt(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-ink-3">Tax</span><span className="tabular text-ink">{fmt(taxTotal)}</span></div>
            <Field label="Discount (₹)">
              <Input type="number" onFocus={(e) => e.target.select()} min={0} value={discountAmount} onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)} />
            </Field>
            <div className="flex justify-between text-base font-semibold border-t border-border pt-2">
              <span>Grand Total</span><span className="tabular">{fmt(grandTotal)}</span>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader
        title={pluralLabel}
        description={`Create and print ${pluralLabel.toLowerCase()} for this business.`}
        actions={<Button onClick={() => { resetForm(); setShowForm(true); }} icon={<Plus className="w-4 h-4" />}>New {label}</Button>}
      />

      {loading ? (
        <LoadingPanel label={`Loading ${pluralLabel.toLowerCase()}…`} />
      ) : docs.length === 0 ? (
        <EmptyState kind="empty" title={`No ${pluralLabel.toLowerCase()} yet`} description={`Create your first ${label.toLowerCase()} above.`} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-6 py-3 text-ink-3 font-medium">Number</th>
                  <th className="text-left px-6 py-3 text-ink-3 font-medium">Party</th>
                  <th className="text-right px-6 py-3 text-ink-3 font-medium">Amount</th>
                  <th className="text-center px-6 py-3 text-ink-3 font-medium">Status</th>
                  <th className="text-left px-6 py-3 text-ink-3 font-medium">Date</th>
                  <th className="text-center px-6 py-3 text-ink-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {docs.map((d) => (
                  <tr key={d._id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-6 py-3 tabular text-xs text-ink-2">{d.docNumber}</td>
                    <td className="px-6 py-3 text-ink">{d.party?.name}</td>
                    <td className="px-6 py-3 text-right tabular text-ink">{fmt(d.grandTotal)}</td>
                    <td className="px-6 py-3 text-center"><Badge tone={STATUS_TONE[d.status] ?? "neutral"}>{d.status}</Badge></td>
                    <td className="px-6 py-3 text-ink-3 text-xs">{new Date(d.createdAt).toLocaleDateString("en-IN")}</td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <Link href={`/console/sales-documents/${d._id}/print`} target="_blank" className="inline-flex items-center justify-center w-8 h-8 rounded-control text-ink-3 hover:text-ink hover:bg-surface-2" title="Print">
                          <Printer className="w-4 h-4" />
                        </Link>
                        <button onClick={() => handleDelete(d._id)} className="inline-flex items-center justify-center w-8 h-8 rounded-control text-ink-3 hover:text-danger hover:bg-danger-soft" title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
