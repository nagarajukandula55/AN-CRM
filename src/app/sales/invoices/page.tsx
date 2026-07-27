"use client";

import { useEffect, useState } from "react";
import {
  Plus, Search, FileText, Send, CheckCircle, Clock, XCircle,
  MoreVertical, Share2, Copy, Printer, IndianRupee, ChevronDown,
} from "lucide-react";
import { useActiveBusinessId } from "@/hooks/useActiveBusinessId";

interface InvoiceItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  total: number;
}

interface Invoice {
  _id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate?: string;
  status: "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED";
  customer: { name: string; email?: string; phone?: string; address?: string; gstin?: string };
  items: InvoiceItem[];
  subtotal: number;
  taxTotal: number;
  discountAmount: number;
  grandTotal: number;
  currency: string;
  notes?: string;
  terms?: string;
  shareToken?: string;
}

const EMPTY_ITEM: InvoiceItem = { description: "", quantity: 1, unit: "pcs", unitPrice: 0, taxRate: 18, taxAmount: 0, total: 0 };

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-500",
  SENT: "bg-blue-500/10 text-blue-700",
  PAID: "bg-emerald-500/10 text-emerald-700",
  OVERDUE: "bg-red-500/10 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  DRAFT: <FileText size={12} />, SENT: <Send size={12} />,
  PAID: <CheckCircle size={12} />, OVERDUE: <Clock size={12} />,
  CANCELLED: <XCircle size={12} />,
};

const fmt = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export default function SalesInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [showForm, setShowForm] = useState(false);
  const [shareModal, setShareModal] = useState<{ url: string; expiry: string } | null>(null);
  const [markPaidModal, setMarkPaidModal] = useState<Invoice | null>(null);
  const [paymentData, setPaymentData] = useState({ paidAmount: 0, paymentMethod: "Bank Transfer", paymentRef: "" });
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);

  // Form state
  const [form, setForm] = useState({
    customer: { name: "", email: "", phone: "", address: "", gstin: "" },
    items: [{ ...EMPTY_ITEM }],
    notes: "",
    terms: "Payment due within 30 days.\nPlease include invoice number on payment.",
    dueDate: "",
    discountAmount: 0,
    status: "DRAFT" as Invoice["status"],
  });

  const { businessId } = useActiveBusinessId();

  useEffect(() => { fetchInvoices(); }, [search, statusFilter]);

  async function fetchInvoices() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search, status: statusFilter, limit: "50" });
      if (businessId) params.set("businessId", businessId);
      const res = await fetch(`/api/sales/invoices?${params}`);
      const data = await res.json();
      if (data.success) setInvoices(data.invoices || []);
    } finally {
      setLoading(false);
    }
  }

  function recalcItems(items: InvoiceItem[]) {
    return items.map((it) => {
      const lineTotal = it.quantity * it.unitPrice;
      const tax = lineTotal * (it.taxRate / 100);
      return { ...it, taxAmount: tax, total: lineTotal + tax };
    });
  }

  function updateItem(idx: number, field: keyof InvoiceItem, value: string | number) {
    const updated = form.items.map((it, i) => i === idx ? { ...it, [field]: value } : it);
    setForm((f) => ({ ...f, items: recalcItems(updated) }));
  }

  const subtotal = form.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const taxTotal = form.items.reduce((s, i) => s + i.taxAmount, 0);
  const grandTotal = subtotal + taxTotal - form.discountAmount;

  async function saveInvoice() {
    if (!form.customer.name.trim()) return alert("Customer name is required");
    setSaving(true);
    try {
      const res = await fetch("/api/sales/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, businessId, items: recalcItems(form.items) }),
      });
      const data = await res.json();
      if (data.success) {
        setShowForm(false);
        setForm({ customer: { name: "", email: "", phone: "", address: "", gstin: "" }, items: [{ ...EMPTY_ITEM }], notes: "", terms: "Payment due within 30 days.\nPlease include invoice number on payment.", dueDate: "", discountAmount: 0, status: "DRAFT" });
        fetchInvoices();
      } else alert(data.error);
    } finally {
      setSaving(false);
    }
  }

  async function shareInvoice(id: string) {
    const res = await fetch(`/api/sales/invoices/${id}/share`, { method: "POST" });
    const data = await res.json();
    if (data.success) setShareModal({ url: data.shareUrl, expiry: data.expiresAt });
  }

  async function markPaid() {
    if (!markPaidModal) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/sales/invoices/${markPaidModal._id}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paidAmount: paymentData.paidAmount || markPaidModal.grandTotal, paymentMethod: paymentData.paymentMethod, paymentRef: paymentData.paymentRef }),
      });
      const data = await res.json();
      if (data.success) { setMarkPaidModal(null); fetchInvoices(); }
    } finally {
      setSaving(false);
    }
  }

  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url);
    setCopying(true);
    setTimeout(() => setCopying(false), 2000);
  }

  // Stats
  const totalRevenue = invoices.filter((i) => i.status === "PAID").reduce((s, i) => s + i.grandTotal, 0);
  const outstanding = invoices.filter((i) => ["SENT", "OVERDUE"].includes(i.status)).reduce((s, i) => s + i.grandTotal, 0);
  const draftCount = invoices.filter((i) => i.status === "DRAFT").length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Sales Invoices</h1>
          <p className="text-sm text-gray-500 mt-0.5">Create and share invoices with partners</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800">
          <Plus size={15} /> New Invoice
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Revenue Collected", value: fmt(totalRevenue), icon: <CheckCircle size={16} className="text-emerald-700" /> },
          { label: "Outstanding", value: fmt(outstanding), icon: <Clock size={16} className="text-amber-700" /> },
          { label: "Drafts", value: String(draftCount), icon: <FileText size={16} className="text-gray-500" /> },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2 mb-1">{s.icon}<span className="text-xs text-gray-500">{s.label}</span></div>
            <p className="text-lg font-semibold text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search invoices…" className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-500 focus:outline-none">
          {["ALL", "DRAFT", "SENT", "PAID", "OVERDUE", "CANCELLED"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Invoice List */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading…</div>
        ) : invoices.length === 0 ? (
          <div className="p-12 text-center">
            <FileText size={32} className="text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500">No invoices yet. Create your first invoice.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200">
              <tr className="text-left">
                {["Invoice #", "Customer", "Issued", "Due", "Amount", "Status", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-xs text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map((inv) => (
                <tr key={inv._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3">
                    <p className="text-gray-900 font-medium">{inv.customer.name}</p>
                    {inv.customer.email && <p className="text-xs text-gray-500">{inv.customer.email}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(inv.issueDate).toLocaleDateString("en-IN")}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("en-IN") : "—"}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{fmt(inv.grandTotal)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[inv.status]}`}>
                      {STATUS_ICON[inv.status]} {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {inv.status !== "PAID" && inv.status !== "CANCELLED" && (
                        <>
                          <button onClick={() => shareInvoice(inv._id)} title="Share link" className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                            <Share2 size={13} />
                          </button>
                          <button onClick={() => { setMarkPaidModal(inv); setPaymentData({ paidAmount: inv.grandTotal, paymentMethod: "Bank Transfer", paymentRef: "" }); }} title="Mark paid" className="p-1.5 text-gray-500 hover:text-emerald-700 hover:bg-emerald-500/10 rounded-lg transition-colors">
                            <CheckCircle size={13} />
                          </button>
                        </>
                      )}
                      <a href={`/invoice/view/${inv.shareToken || "preview"}`} target="_blank" rel="noreferrer" title="Preview" className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                        <Printer size={13} />
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── NEW INVOICE FORM MODAL ─────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-3xl bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-gray-900 font-semibold">New Invoice</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-gray-900 text-xl leading-none">×</button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-6">
              {/* Customer */}
              <div>
                <h3 className="text-xs uppercase tracking-widest text-gray-500 mb-3">Customer / Partner</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: "name", label: "Name *", placeholder: "Customer name" },
                    { key: "email", label: "Email", placeholder: "email@example.com" },
                    { key: "phone", label: "Phone", placeholder: "+91 98765 43210" },
                    { key: "gstin", label: "GSTIN", placeholder: "22AAAAA0000A1Z5" },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <label className="text-xs text-gray-500 block mb-1">{label}</label>
                      <input
                        value={(form.customer as any)[key]}
                        onChange={(e) => setForm((f) => ({ ...f, customer: { ...f.customer, [key]: e.target.value } }))}
                        placeholder={placeholder}
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
                      />
                    </div>
                  ))}
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 block mb-1">Address</label>
                    <input
                      value={form.customer.address}
                      onChange={(e) => setForm((f) => ({ ...f, customer: { ...f.customer, address: e.target.value } }))}
                      placeholder="Full address"
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
                    />
                  </div>
                </div>
              </div>

              {/* Line Items */}
              <div>
                <h3 className="text-xs uppercase tracking-widest text-gray-500 mb-3">Line Items</h3>
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 text-xs text-gray-600 px-1">
                    <span className="col-span-4">Description</span>
                    <span className="col-span-1 text-center">Qty</span>
                    <span className="col-span-1 text-center">Unit</span>
                    <span className="col-span-2 text-right">Price</span>
                    <span className="col-span-2 text-right">GST%</span>
                    <span className="col-span-2 text-right">Total</span>
                  </div>
                  {form.items.map((item, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                      <input value={item.description} onChange={(e) => updateItem(i, "description", e.target.value)} placeholder="Item description" className="col-span-4 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none" />
                      <input type="number" value={item.quantity} onChange={(e) => updateItem(i, "quantity", parseFloat(e.target.value) || 0)} onFocus={(e) => e.target.select()} placeholder="Qty" className="col-span-1 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 text-center focus:outline-none" />
                      <input value={item.unit} onChange={(e) => updateItem(i, "unit", e.target.value)} className="col-span-1 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-500 text-center focus:outline-none" />
                      <input type="number" value={item.unitPrice} onChange={(e) => updateItem(i, "unitPrice", parseFloat(e.target.value) || 0)} onFocus={(e) => e.target.select()} placeholder="Price" className="col-span-2 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 text-right focus:outline-none" />
                      <input type="number" value={item.taxRate} onChange={(e) => updateItem(i, "taxRate", parseFloat(e.target.value) || 0)} onFocus={(e) => e.target.select()} placeholder="GST %" className="col-span-2 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 text-right focus:outline-none" />
                      <div className="col-span-2 flex items-center justify-end gap-1">
                        <span className="text-sm text-gray-900 font-medium">{fmt(item.total)}</span>
                        {form.items.length > 1 && (
                          <button onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, j) => j !== i) }))} className="text-gray-600 hover:text-red-700 text-xs ml-1">×</button>
                        )}
                      </div>
                    </div>
                  ))}
                  <button onClick={() => setForm((f) => ({ ...f, items: [...f.items, { ...EMPTY_ITEM }] }))} className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1 mt-1">
                    <Plus size={12} /> Add item
                  </button>
                </div>
              </div>

              {/* Totals + fields */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Due Date</label>
                    <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Status</label>
                    <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as any }))} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 focus:outline-none">
                      <option value="DRAFT">Draft</option>
                      <option value="SENT">Send now</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Discount (₹)</label>
                    <input type="number" value={form.discountAmount} onChange={(e) => setForm((f) => ({ ...f, discountAmount: parseFloat(e.target.value) || 0 }))} onFocus={(e) => e.target.select()} placeholder="Discount amount" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none" />
                  </div>
                </div>
                <div>
                  <div className="rounded-xl border border-gray-200 p-4 space-y-2 text-sm">
                    <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
                    <div className="flex justify-between text-gray-500"><span>GST</span><span>{fmt(taxTotal)}</span></div>
                    {form.discountAmount > 0 && <div className="flex justify-between text-emerald-700"><span>Discount</span><span>−{fmt(form.discountAmount)}</span></div>}
                    <div className="flex justify-between font-semibold text-gray-900 text-base pt-2 border-t border-gray-200"><span>Total</span><span>{fmt(grandTotal)}</span></div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Notes</label>
                  <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Additional notes…" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none resize-none" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Terms & Conditions</label>
                  <textarea value={form.terms} onChange={(e) => setForm((f) => ({ ...f, terms: e.target.value }))} rows={3} placeholder="Terms and conditions…" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none resize-none" />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900">Cancel</button>
              <button onClick={saveInvoice} disabled={saving} className="px-5 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
                {saving ? "Saving…" : "Create Invoice"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {shareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
            <h2 className="text-gray-900 font-semibold flex items-center gap-2"><Share2 size={16} /> Share Invoice</h2>
            <p className="text-sm text-gray-500">This link allows anyone to view the invoice without logging in. Valid for 72 hours.</p>
            <div className="flex gap-2">
              <input readOnly value={shareModal.url} className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 select-all" />
              <button onClick={() => copyUrl(shareModal.url)} className="px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-900 hover:bg-gray-100 flex items-center gap-1">
                <Copy size={13} />{copying ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="flex gap-2">
              <a href={shareModal.url} target="_blank" rel="noreferrer" className="flex-1 text-center px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-900 hover:bg-gray-50">Open Preview</a>
              <button onClick={() => setShareModal(null)} className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Mark Paid Modal */}
      {markPaidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
            <h2 className="text-gray-900 font-semibold flex items-center gap-2"><CheckCircle size={16} className="text-emerald-700" /> Mark as Paid</h2>
            <p className="text-sm text-gray-500">{markPaidModal.invoiceNumber} · {markPaidModal.customer.name}</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Amount Received (₹)</label>
                <input type="number" value={paymentData.paidAmount} onChange={(e) => setPaymentData((p) => ({ ...p, paidAmount: parseFloat(e.target.value) || 0 }))} onFocus={(e) => e.target.select()} placeholder="Amount received" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Payment Method</label>
                <select value={paymentData.paymentMethod} onChange={(e) => setPaymentData((p) => ({ ...p, paymentMethod: e.target.value }))} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 focus:outline-none">
                  {["Bank Transfer", "UPI", "Cash", "Cheque", "Card"].map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Reference / UTR</label>
                <input value={paymentData.paymentRef} onChange={(e) => setPaymentData((p) => ({ ...p, paymentRef: e.target.value }))} placeholder="Transaction reference" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none" />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setMarkPaidModal(null)} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-500">Cancel</button>
              <button onClick={markPaid} disabled={saving} className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-xl text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">
                {saving ? "Saving…" : "Confirm Payment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
