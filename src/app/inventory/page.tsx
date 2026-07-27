"use client";

import { useEffect, useState, useRef } from "react";
import {
  Plus, Search, Package, Upload, Filter, Edit3, Trash2,
  ArrowUpDown, Tag, BarChart3, AlertTriangle, CheckCircle,
} from "lucide-react";
import { useActiveBusinessId } from "@/hooks/useActiveBusinessId";

interface Product {
  _id: string;
  name: string;
  sku: string;
  category: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  costPrice: number;
  reorderLevel: number;
  supplier?: string;
  description?: string;
  imageUrl?: string;
  status: "active" | "inactive" | "out_of_stock";
  createdAt: string;
}

interface FormState {
  name: string;
  sku: string;
  category: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  costPrice: number;
  reorderLevel: number;
  supplier: string;
  description: string;
}

const UNITS = ["pcs", "kg", "g", "litre", "ml", "box", "pack", "set", "pair", "roll"];
const CATEGORIES = ["Electronics", "Clothing", "Food", "Furniture", "Raw Material", "Packaging", "Tools", "Stationery", "Other"];

const EMPTY_FORM: FormState = {
  name: "", sku: "", category: "Other", quantity: 0, unit: "pcs",
  unitPrice: 0, costPrice: 0, reorderLevel: 5, supplier: "", description: "",
};

const fmt = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [adjustModal, setAdjustModal] = useState<Product | null>(null);
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustNote, setAdjustNote] = useState("");
  const csvRef = useRef<HTMLInputElement>(null);

  const { businessId } = useActiveBusinessId();

  useEffect(() => { fetchProducts(); }, [search, category]);

  async function fetchProducts() {
    setLoading(true);
    try {
      const p = new URLSearchParams({ search, limit: "100" });
      if (category !== "ALL") p.set("category", category);
      if (businessId) p.set("businessId", businessId);
      const res = await fetch(`/api/inventory/items?${p}`);
      const data = await res.json();
      if (data.success) setProducts(data.items || data.data || []);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditProduct(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(p: Product) {
    setEditProduct(p);
    setForm({
      name: p.name, sku: p.sku, category: p.category,
      quantity: p.quantity, unit: p.unit,
      unitPrice: p.unitPrice, costPrice: p.costPrice,
      reorderLevel: p.reorderLevel,
      supplier: p.supplier || "", description: p.description || "",
    });
    setShowForm(true);
  }

  async function saveProduct() {
    if (!form.name.trim()) return alert("Product name is required");
    setSaving(true);
    try {
      const url = editProduct ? `/api/inventory/items/${editProduct._id}` : "/api/inventory/items";
      const method = editProduct ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, businessId }),
      });
      const data = await res.json();
      if (data.success || data._id || data.item) {
        setShowForm(false);
        fetchProducts();
      } else alert(data.error || data.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(id: string) {
    if (!confirm("Delete this product?")) return;
    await fetch(`/api/inventory/items/${id}`, { method: "DELETE" });
    fetchProducts();
  }

  async function adjustStock() {
    if (!adjustModal) return;
    await fetch("/api/inventory/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId: adjustModal._id,
        type: adjustQty >= 0 ? "IN" : "OUT",
        quantity: Math.abs(adjustQty),
        note: adjustNote,
        businessId,
      }),
    });
    setAdjustModal(null);
    setAdjustQty(0);
    setAdjustNote("");
    fetchProducts();
  }

  // CSV bulk import
  async function handleCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const text = await file.text();
      const lines = text.split("\n").filter(Boolean);
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const rows = lines.slice(1).map((line) => {
        const vals = line.split(",");
        const obj: any = {};
        headers.forEach((h, i) => (obj[h] = vals[i]?.trim()));
        return obj;
      });

      let created = 0;
      for (const row of rows) {
        if (!row.name) continue;
        const res = await fetch("/api/inventory/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: row.name, sku: row.sku || "", category: row.category || "Other",
            quantity: parseFloat(row.quantity) || 0, unit: row.unit || "pcs",
            unitPrice: parseFloat(row["unit price"] || row.unitprice) || 0,
            costPrice: parseFloat(row["cost price"] || row.costprice) || 0,
            reorderLevel: parseFloat(row["reorder level"] || row.reorderlevel) || 5,
            supplier: row.supplier || "", description: row.description || "",
            businessId,
          }),
        });
        if (res.ok) created++;
      }
      alert(`Imported ${created} products successfully`);
      fetchProducts();
    } finally {
      setUploading(false);
      if (csvRef.current) csvRef.current.value = "";
    }
  }

  function downloadTemplate() {
    const csv = "name,sku,category,quantity,unit,unit price,cost price,reorder level,supplier,description\nSample Product,SKU-001,Electronics,100,pcs,999,750,10,Supplier Name,Sample description";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory_template.csv";
    a.click();
  }

  const totalValue = products.reduce((s, p) => s + p.quantity * p.costPrice, 0);
  const lowStock = products.filter((p) => p.quantity <= p.reorderLevel).length;
  const outOfStock = products.filter((p) => p.quantity === 0).length;

  const categories = ["ALL", ...Array.from(new Set(products.map((p) => p.category)))];

  const stockStatus = (p: Product) => {
    if (p.quantity === 0) return { label: "Out of Stock", cls: "text-red-700 bg-red-500/10" };
    if (p.quantity <= p.reorderLevel) return { label: "Low Stock", cls: "text-amber-700 bg-amber-500/10" };
    return { label: "In Stock", cls: "text-emerald-700 bg-emerald-500/10" };
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage products, stock levels and movements</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={csvRef} type="file" accept=".csv" onChange={handleCSV} className="hidden" />
          <button onClick={downloadTemplate} className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl hover:text-gray-900 hover:border-gray-400">
            CSV Template
          </button>
          <button onClick={() => csvRef.current?.click()} disabled={uploading} className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 border border-gray-200 rounded-xl hover:text-gray-900">
            <Upload size={13} /> {uploading ? "Importing…" : "Import CSV"}
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800">
            <Plus size={15} /> Add Product
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Products", value: String(products.length), icon: <Package size={16} className="text-gray-500" /> },
          { label: "Inventory Value", value: fmt(totalValue), icon: <BarChart3 size={16} className="text-blue-700" /> },
          { label: "Low Stock", value: String(lowStock), icon: <AlertTriangle size={16} className="text-amber-700" /> },
          { label: "Out of Stock", value: String(outOfStock), icon: <AlertTriangle size={16} className="text-red-700" /> },
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
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…" className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400" />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} title="Filter by category" className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-500 focus:outline-none">
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading…</div>
        ) : products.length === 0 ? (
          <div className="p-12 text-center">
            <Package size={32} className="text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">No products yet. Add your first product or import a CSV.</p>
            <button onClick={openCreate} className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium">Add Product</button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200">
              <tr>
                {["Product", "SKU", "Category", "Stock", "Unit Price", "Cost Price", "Status", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products.map((p) => {
                const status = stockStatus(p);
                return (
                  <tr key={p._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-gray-900 font-medium">{p.name}</p>
                      {p.supplier && <p className="text-xs text-gray-500">{p.supplier}</p>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.sku || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded-full">{p.category}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => { setAdjustModal(p); setAdjustQty(0); }} className="flex items-center gap-1.5 hover:text-gray-900 text-gray-600 group">
                        <span className="font-semibold">{p.quantity}</span>
                        <span className="text-xs text-gray-500">{p.unit}</span>
                        <ArrowUpDown size={11} className="text-gray-600 group-hover:text-gray-500" />
                      </button>
                      {p.quantity <= p.reorderLevel && p.quantity > 0 && (
                        <p className="text-[10px] text-amber-700 mt-0.5">Reorder at {p.reorderLevel}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-900">{fmt(p.unitPrice)}</td>
                    <td className="px-4 py-3 text-gray-500">{fmt(p.costPrice)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.cls}`}>{status.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => openEdit(p)} className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg"><Edit3 size={12} /></button>
                        <button onClick={() => deleteProduct(p._id)} className="p-1.5 text-gray-500 hover:text-red-700 hover:bg-red-500/10 rounded-lg"><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ADD/EDIT FORM MODAL */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-gray-900 font-semibold">{editProduct ? "Edit Product" : "Add New Product"}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-gray-900 text-xl">×</button>
            </div>
            <div className="overflow-y-auto flex-1 p-6">
              <div className="grid grid-cols-2 gap-4">
                {/* Name */}
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 block mb-1">Product Name *</label>
                  <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Enter product name" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400" />
                </div>
                {/* SKU */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">SKU / Code</label>
                  <input value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} placeholder="e.g. PRD-001" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none" />
                </div>
                {/* Category */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Category</label>
                  <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} title="Select product category" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 focus:outline-none">
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                {/* Quantity */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Opening Stock</label>
                  <input type="number" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))} onFocus={(e) => e.target.select()} placeholder="Opening stock quantity" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none" />
                </div>
                {/* Unit */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Unit</label>
                  <select value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} title="Select unit of measurement" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 focus:outline-none">
                    {UNITS.map((u) => <option key={u}>{u}</option>)}
                  </select>
                </div>
                {/* Unit Price */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Selling Price (₹)</label>
                  <input type="number" value={form.unitPrice} onChange={(e) => setForm((f) => ({ ...f, unitPrice: parseFloat(e.target.value) || 0 }))} onFocus={(e) => e.target.select()} placeholder="Selling price per unit" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none" />
                </div>
                {/* Cost Price */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Cost Price (₹)</label>
                  <input type="number" value={form.costPrice} onChange={(e) => setForm((f) => ({ ...f, costPrice: parseFloat(e.target.value) || 0 }))} onFocus={(e) => e.target.select()} placeholder="Cost price per unit" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none" />
                </div>
                {/* Reorder Level */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Reorder Level</label>
                  <input type="number" value={form.reorderLevel} onChange={(e) => setForm((f) => ({ ...f, reorderLevel: parseFloat(e.target.value) || 0 }))} onFocus={(e) => e.target.select()} placeholder="Reorder threshold" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none" />
                </div>
                {/* Supplier */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Supplier</label>
                  <input value={form.supplier} onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))} placeholder="Supplier name" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none" />
                </div>
                {/* Description */}
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 block mb-1">Description</label>
                  <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} placeholder="Product description…" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none resize-none" />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900">Cancel</button>
              <button onClick={saveProduct} disabled={saving} className="px-5 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
                {saving ? "Saving…" : editProduct ? "Save Changes" : "Add Product"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STOCK ADJUST MODAL */}
      {adjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
            <h2 className="text-gray-900 font-semibold flex items-center gap-2"><ArrowUpDown size={16} /> Adjust Stock</h2>
            <p className="text-sm text-gray-500">{adjustModal.name} · Current: <strong className="text-gray-900">{adjustModal.quantity} {adjustModal.unit}</strong></p>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Adjustment (+/−)</label>
              <input type="number" value={adjustQty} onChange={(e) => setAdjustQty(parseFloat(e.target.value) || 0)} onFocus={(e) => e.target.select()} placeholder="+50 to add, -10 to remove" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none" />
              <p className="text-xs text-gray-500 mt-1">New total: {Math.max(0, adjustModal.quantity + adjustQty)} {adjustModal.unit}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Reason / Note</label>
              <input value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} placeholder="Purchase, damage, return…" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none" />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setAdjustModal(null)} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-500">Cancel</button>
              <button onClick={adjustStock} disabled={adjustQty === 0} className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-50">Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
