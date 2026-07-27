"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import {
  Tag,
  Plus,
  Search,
  Copy,
  Check,
  Pencil,
  Trash2,
  X,
  RefreshCw,
  TicketPercent,
  BadgePercent,
  Banknote,
  CalendarClock,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Coupon {
  _id: string;
  code: string;
  description?: string;
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: number;
  minOrderValue: number;
  maxDiscountAmount?: number;
  usageLimit?: number;
  usageCount: number;
  validFrom?: string;
  validUntil?: string;
  status: "ACTIVE" | "INACTIVE" | "EXPIRED";
  applicableBrands?: { _id: string; name: string }[];
}

interface FormData {
  code: string;
  description: string;
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: string;
  minOrderValue: string;
  maxDiscountAmount: string;
  usageLimit: string;
  validUntil: string;
  status: "ACTIVE" | "INACTIVE";
  applicableBrandIds: string[];
}

const EMPTY_FORM: FormData = {
  code: "",
  description: "",
  discountType: "FIXED",
  discountValue: "",
  minOrderValue: "",
  maxDiscountAmount: "",
  usageLimit: "",
  validUntil: "",
  status: "ACTIVE",
  applicableBrandIds: [],
};

interface BrandOption { _id: string; name: string }

// ─── Helpers ─────────────────────────────────────────────────────────────────
const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

function generateCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function couponStatus(c: Coupon): "Active" | "Expired" | "Disabled" {
  if (c.status === "INACTIVE") return "Disabled";
  if (c.status === "EXPIRED") return "Expired";
  if (c.validUntil && new Date(c.validUntil) < new Date()) return "Expired";
  if (c.usageLimit && c.usageCount >= c.usageLimit) return "Expired";
  return "Active";
}

// ─── Stat Card ───────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 flex items-center gap-4">
      <div className={`p-2.5 rounded-xl ${accent}`}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-xl font-semibold text-gray-900 mt-0.5">{value}</p>
      </div>
    </div>
  );
}

interface BusinessOption { _id: string; name: string; brandName?: string }

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CouponsPage() {
  // Was reading businessId from localStorage — a dead mechanism nothing in
  // the app writes to anymore (the only writer, businessSwitcher.tsx, isn't
  // wired into the app), so this page silently never loaded any coupons for
  // anyone. Coupons are already businessId-scoped at the model/API layer
  // (Coupon.businessId is required, unique per business) — the real gap was
  // this page never asking which business's coupons to show/create, same
  // bug as the vendor onboarding form had.
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Coupon | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<Coupon | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: meData } = useSWR("/api/auth/me");
  const isSuperAdmin = !!meData?.isSuperAdmin;
  const allBusinesses: BusinessOption[] = meData?.businesses || [];

  useEffect(() => {
    if (meData) {
      const bId: string | null = meData.user?.activeBusinessId || meData.businesses?.[0]?._id || null;
      setBusinessId(bId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meData]);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const {
    data: couponsRes,
    isLoading: loading,
    mutate: fetchCoupons,
  } = useSWR(businessId ? `/api/coupons?businessId=${businessId}` : null, { keepPreviousData: true });
  const coupons: Coupon[] = couponsRes?.success ? couponsRes.coupons : [];

  // Brand list for the applicable-brands selector, scoped to the coupon's business
  const { data: brandsRes } = useSWR(businessId ? `/api/brands?businessId=${businessId}` : null);
  const brands: BrandOption[] = brandsRes?.brands || brandsRes?.data || [];

  // ── Derived stats ────────────────────────────────────────────────────────
  const stats = {
    total: coupons.length,
    active: coupons.filter((c) => couponStatus(c) === "Active").length,
    expired: coupons.filter((c) => couponStatus(c) === "Expired").length,
    redemptions: coupons.reduce((s, c) => s + (c.usageCount ?? 0), 0),
  };

  // ── Filtered list ────────────────────────────────────────────────────────
  const filtered = coupons.filter((c) => {
    const matchSearch =
      !search || c.code.toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      filterStatus === "all" ||
      couponStatus(c).toLowerCase() === filterStatus.toLowerCase();
    return matchSearch && matchStatus;
  });

  // ── Copy code ────────────────────────────────────────────────────────────
  function copyCode(id: string, code: string) {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  // ── Open Create modal ────────────────────────────────────────────────────
  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setFormError("");
    // Super admins in "All Businesses" view have no businessId selected —
    // default the modal's target business to the first available one so
    // the create button isn't silently broken; they can still switch it.
    if (!businessId && allBusinesses.length > 0) {
      setBusinessId(allBusinesses[0]._id);
    }
    setShowModal(true);
  }

  // ── Open Edit modal ──────────────────────────────────────────────────────
  function openEdit(c: Coupon) {
    setEditTarget(c);
    setForm({
      code: c.code,
      description: c.description ?? "",
      discountType: c.discountType,
      discountValue: String(c.discountValue),
      minOrderValue: c.minOrderValue ? String(c.minOrderValue) : "",
      maxDiscountAmount: c.maxDiscountAmount ? String(c.maxDiscountAmount) : "",
      usageLimit: c.usageLimit ? String(c.usageLimit) : "",
      validUntil: c.validUntil ? c.validUntil.slice(0, 10) : "",
      status: c.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
      applicableBrandIds: (c.applicableBrands || []).map((b) => b._id),
    });
    setFormError("");
    setShowModal(true);
  }

  // ── Save (create / update) ───────────────────────────────────────────────
  async function handleSave() {
    if (!businessId) { setFormError("Select which business this coupon belongs to."); return; }
    if (!form.code.trim()) { setFormError("Coupon code is required."); return; }
    if (!form.discountValue) { setFormError("Discount value is required."); return; }

    setSaving(true);
    setFormError("");

    const payload = {
      businessId,
      code: form.code.toUpperCase().trim(),
      description: form.description,
      discountType: form.discountType,
      discountValue: parseFloat(form.discountValue),
      minOrderValue: form.minOrderValue ? parseFloat(form.minOrderValue) : 0,
      maxDiscountAmount: form.maxDiscountAmount ? parseFloat(form.maxDiscountAmount) : undefined,
      usageLimit: form.usageLimit ? parseInt(form.usageLimit) : undefined,
      validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : undefined,
      status: form.status,
      applicableBrands: form.applicableBrandIds,
    };

    try {
      const url = editTarget ? `/api/coupons/${editTarget._id}` : "/api/coupons";
      const method = editTarget ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setFormError(data.error ?? "Something went wrong.");
        return;
      }
      setShowModal(false);
      fetchCoupons();
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/coupons/${deleteTarget._id}`, { method: "DELETE" });
      setDeleteTarget(null);
      fetchCoupons();
    } finally {
      setDeleting(false);
    }
  }

  // ── Status badge ─────────────────────────────────────────────────────────
  function StatusBadge({ coupon }: { coupon: Coupon }) {
    const s = couponStatus(coupon);
    const cls =
      s === "Active"
        ? "text-xs font-medium px-2 py-0.5 rounded-full text-emerald-400 bg-emerald-500/10"
        : s === "Expired"
        ? "text-xs font-medium px-2 py-0.5 rounded-full text-red-400 bg-red-500/10"
        : "text-xs font-medium px-2 py-0.5 rounded-full text-gray-500 bg-white";
    return <span className={cls}>{s}</span>;
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Coupons</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage discount codes and promotions
          </p>
        </div>
        {isSuperAdmin && (
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
            <Plus size={16} />
            New Coupon
          </button>
        )}
      </div>
      {!isSuperAdmin && (
        <div className="px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
          Coupons can only be created or edited by a Super Admin.
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Coupons" value={stats.total} icon={Tag} accent="bg-blue-50 text-blue-600" />
        <StatCard label="Active" value={stats.active} icon={TicketPercent} accent="bg-emerald-50 text-emerald-600" />
        <StatCard label="Expired" value={stats.expired} icon={CalendarClock} accent="bg-red-50 text-red-600" />
        <StatCard label="Total Redemptions" value={stats.redemptions} icon={BadgePercent} accent="bg-amber-50 text-amber-600" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code…"
            className="w-full pl-9 pr-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          title="Filter by status"
          className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="disabled">Disabled</option>
        </select>
        <button
          onClick={() => fetchCoupons()}
          className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl hover:text-gray-900 hover:border-gray-400 flex items-center gap-1.5"
        >
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="border-b border-gray-200 bg-white">
            <tr>
              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Code</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Type</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Value</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Min Order</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Max Discount</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Expires At</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Usage</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Status</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={9}>
                  <div className="p-12 text-center text-gray-500">Loading…</div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <div className="p-12 text-center">
                    <Tag size={32} className="mx-auto text-gray-700 mb-3" />
                    <p className="text-gray-500 text-sm">No coupons found</p>
                    {isSuperAdmin && (
                      <button
                        onClick={openCreate}
                        className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700"
                      >
                        Create your first coupon
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c._id} className="hover:bg-gray-50 transition-colors">
                  {/* Code */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium text-gray-900 tracking-wide">
                        {c.code}
                      </span>
                      <button
                        onClick={() => copyCode(c._id, c.code)}
                        className="text-gray-600 hover:text-gray-600 transition-colors"
                        title="Copy code"
                      >
                        {copiedId === c._id ? (
                          <Check size={13} className="text-emerald-400" />
                        ) : (
                          <Copy size={13} />
                        )}
                      </button>
                    </div>
                    {c.description && (
                      <p className="text-xs text-gray-600 mt-0.5 truncate max-w-[160px]">
                        {c.description}
                      </p>
                    )}
                  </td>

                  {/* Type */}
                  <td className="px-4 py-3">
                    <span
                      className={
                        c.discountType === "PERCENTAGE"
                          ? "text-xs font-medium px-2 py-0.5 rounded-full text-blue-400 bg-blue-500/10"
                          : "text-xs font-medium px-2 py-0.5 rounded-full text-amber-400 bg-amber-500/10"
                      }
                    >
                      {c.discountType === "PERCENTAGE" ? "PERCENT" : "FLAT"}
                    </span>
                  </td>

                  {/* Value */}
                  <td className="px-4 py-3 text-gray-900 font-medium">
                    {c.discountType === "PERCENTAGE"
                      ? `${c.discountValue}%`
                      : inr(c.discountValue)}
                  </td>

                  {/* Min Order */}
                  <td className="px-4 py-3 text-gray-500">
                    {c.minOrderValue ? inr(c.minOrderValue) : <span className="text-gray-700">—</span>}
                  </td>

                  {/* Max Discount */}
                  <td className="px-4 py-3 text-gray-500">
                    {c.maxDiscountAmount ? inr(c.maxDiscountAmount) : <span className="text-gray-700">—</span>}
                  </td>

                  {/* Expires */}
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {c.validUntil
                      ? new Date(c.validUntil).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : <span className="text-gray-700">—</span>}
                  </td>

                  {/* Usage */}
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    <span className="text-gray-900 font-medium">{c.usageCount ?? 0}</span>
                    {c.usageLimit ? ` / ${c.usageLimit}` : ""}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <StatusBadge coupon={c} />
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    {isSuperAdmin ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(c)}
                          className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:text-gray-900 hover:border-gray-400 flex items-center gap-1"
                        >
                          <Pencil size={11} />
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteTarget(c)}
                          className="px-3 py-1.5 text-xs text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/10 flex items-center gap-1"
                        >
                          <Trash2 size={11} />
                          Delete
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Super Admin only</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Create / Edit Modal ─────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white border border-gray-200 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  {editTarget ? "Edit Coupon" : "Create Coupon"}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {editTarget ? `Editing ${editTarget.code}` : "Add a new discount code"}
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-500 hover:text-gray-900 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {formError && (
                <div className="px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
                  {formError}
                </div>
              )}

              {/* Business (super admin only — a specific business's page always has one) */}
              {isSuperAdmin && allBusinesses.length > 0 && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Business *</label>
                  <select
                    value={businessId ?? ""}
                    onChange={(e) => setBusinessId(e.target.value || null)}
                    title="Select business"
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-gray-400"
                  >
                    <option value="" disabled>Select a business…</option>
                    {allBusinesses.map((b) => (
                      <option key={b._id} value={b._id}>
                        {b.brandName || b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Code */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Coupon Code *</label>
                <div className="flex gap-2">
                  <input
                    value={form.code}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))
                    }
                    placeholder="e.g. SAVE20"
                    className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 font-mono tracking-wider uppercase"
                  />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, code: generateCode() }))}
                    className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg hover:text-gray-900 hover:border-gray-400 whitespace-nowrap flex items-center gap-1"
                  >
                    <RefreshCw size={11} />
                    Auto
                  </button>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Description</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Optional description"
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
                />
              </div>

              {/* Applicable Brands */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  Applicable Brands <span className="text-gray-400">(leave empty for all brands)</span>
                </label>
                {brands.length === 0 ? (
                  <p className="text-xs text-gray-400">
                    No brands set up yet for this business — see Masters &gt; Brands.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-2">
                    {brands.map((b) => {
                      const checked = form.applicableBrandIds.includes(b._id);
                      return (
                        <label
                          key={b._id}
                          className={`text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer ${
                            checked
                              ? "border-indigo-600 bg-indigo-600 text-white"
                              : "border-gray-200 text-gray-600 hover:border-gray-400"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                applicableBrandIds: e.target.checked
                                  ? [...f.applicableBrandIds, b._id]
                                  : f.applicableBrandIds.filter((id) => id !== b._id),
                              }))
                            }
                            className="hidden"
                          />
                          {b.name}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Type */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Discount Type *</label>
                <div className="grid grid-cols-2 gap-3">
                  {(["FIXED", "PERCENTAGE"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, discountType: t }))}
                      className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                        form.discountType === t
                          ? "border-gray-300 bg-gray-50 text-gray-900"
                          : "border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-600"
                      }`}
                    >
                      {t === "FIXED" ? (
                        <Banknote size={15} />
                      ) : (
                        <BadgePercent size={15} />
                      )}
                      {t === "FIXED" ? "FLAT (₹)" : "PERCENT (%)"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Value + Min Order */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">
                    {form.discountType === "PERCENTAGE" ? "Discount (%)" : "Discount (₹)"} *
                  </label>
                  <input
                    type="number"
                    value={form.discountValue}
                    onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))}
                    onFocus={(e) => e.target.select()}
                    placeholder={form.discountType === "PERCENTAGE" ? "e.g. 20" : "e.g. 100"}
                    min={0}
                    max={form.discountType === "PERCENTAGE" ? 100 : undefined}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Min Order Value (₹)</label>
                  <input
                    type="number"
                    value={form.minOrderValue}
                    onChange={(e) => setForm((f) => ({ ...f, minOrderValue: e.target.value }))}
                    onFocus={(e) => e.target.select()}
                    placeholder="e.g. 500"
                    min={0}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
                  />
                </div>
              </div>

              {/* Max Discount (percent only) + Usage Limit */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">
                    Max Discount (₹){" "}
                    {form.discountType === "FIXED" && (
                      <span className="text-gray-700">(N/A for FLAT)</span>
                    )}
                  </label>
                  <input
                    type="number"
                    value={form.maxDiscountAmount}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, maxDiscountAmount: e.target.value }))
                    }
                    onFocus={(e) => e.target.select()}
                    placeholder="e.g. 200"
                    min={0}
                    disabled={form.discountType === "FIXED"}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 disabled:opacity-40"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Usage Limit</label>
                  <input
                    type="number"
                    value={form.usageLimit}
                    onChange={(e) => setForm((f) => ({ ...f, usageLimit: e.target.value }))}
                    onFocus={(e) => e.target.select()}
                    placeholder="Unlimited"
                    min={1}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
                  />
                </div>
              </div>

              {/* Expiry */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Expiry Date</label>
                <input
                  type="date"
                  value={form.validUntil}
                  onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
                  title="Select expiry date"
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
                />
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 bg-white">
                <div>
                  <p className="text-sm text-gray-900 font-medium">Active</p>
                  <p className="text-xs text-gray-500">Coupon can be redeemed by customers</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      status: f.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                    }))
                  }
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    form.status === "ACTIVE" ? "bg-emerald-500" : "bg-white/10"
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${
                      form.status === "ACTIVE" ? "left-6" : "left-1"
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl hover:text-gray-900 hover:border-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving ? "Saving…" : editTarget ? "Save Changes" : "Create Coupon"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ──────────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-base font-semibold text-gray-900">Delete Coupon</h2>
              <button
                onClick={() => setDeleteTarget(null)}
                className="text-gray-500 hover:text-gray-900 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-gray-500">
                Are you sure you want to delete the coupon{" "}
                <span className="font-mono font-semibold text-gray-900">
                  {deleteTarget.code}
                </span>
                ? This action cannot be undone.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl hover:text-gray-900 hover:border-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-2 text-xs text-red-400 border border-red-500/20 rounded-xl hover:bg-red-500/10 disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete Coupon"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
