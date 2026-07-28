"use client";

// Business detail/edit page — rebuilt after src/app/businesses/[id]/page.tsx
// was accidentally deleted during the top-level orphaned-pages cleanup pass
// (it was flagged by the classification agent as unique functionality with
// "no admin [id] equivalent," but got swept up in a bulk `rm -rf` alongside
// the genuinely-stale businesses/page.tsx and businesses/create/page.tsx).
// No git history / backup existed to recover the original file's exact
// content, so this is a fresh implementation against the same
// /api/businesses/[id] GET+PATCH endpoint, matching this admin/business/
// section's existing style (see ../page.tsx).

import React, { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { BUSINESS_TYPE_OPTIONS, INDUSTRY_OPTIONS } from "@/data/businessConstants";
import { StateSelect, CitySelect, PincodeInput } from "@/components/shared/LocationSelect";
import { validateGSTINAgainstState } from "@/lib/validation/gst";
import { VENDOR_DOC_CATALOG } from "@/core/vendorCompliance";
// Canonical list of every real app module/section, sourced from the same
// NAV_GROUPS the sidebar renders from — this is the checklist an admin
// toggles per business (see Business.ts's ModuleSchema + the "Modules"
// section below).
import { STATIC_MODULES } from "@/components/sidebar";
import { useToast } from "@/components/shared/Toast";
import { MODULE_TEMPLATE_OPTIONS, isEnabledUnderTemplate, describeBusinessUsage, type ModuleTemplateKey } from "@/core/access/moduleTemplates";
import DocumentNumbersPanel from "@/components/admin/DocumentNumbersPanel";
import DocumentTemplateSelectorPanel from "@/components/admin/DocumentTemplateSelectorPanel";
import ProductCategoriesPanel from "@/components/admin/ProductCategoriesPanel";
import { IconPicker } from "@/components/ui/IconPicker";

interface AuditLogEntry {
  _id: string;
  action: string;
  entity: string;
  entityId?: string | null;
  userEmail?: string;
  userName?: string;
  isSuperAdmin?: boolean;
  createdAt: string;
}

interface Business {
  _id: string;
  name: string;
  legalName?: string;
  brandName?: string;
  businessCode?: string;
  brandShortcut?: string;
  inventorySerialized?: boolean;
  applyTaxOnB2CBilling?: boolean;
  industry?: string;
  type?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  isActive?: boolean;
  compliance?: {
    gstNumber?: string;
    pan?: string;
    cin?: string;
    msme?: string;
    iec?: string;
    fssai?: string;
    drugLicense?: string;
  };
  financial?: {
    currency?: string;
    fiscalYearStart?: string;
    taxStandard?: string;
    decimalPlaces?: number;
    priceIncludesTax?: boolean;
  };
  gstStateCode?: string;
  modules?: ModuleToggle[];
  logo?: string;
  favicon?: string;
  vendorDocumentRequirements?: { key: string; mandatory: boolean }[];
}

interface ModuleToggle {
  key: string;
  label: string;
  route: string;
  icon: string;
  enabled: boolean;
}

type EditableForm = {
  name: string;
  legalName: string;
  brandName: string;
  businessCode: string;
  brandShortcut: string;
  inventorySerialized: boolean;
  applyTaxOnB2CBilling: boolean;
  industry: string;
  type: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstStateCode: string;
  compliance: {
    gstNumber: string;
    pan: string;
    cin: string;
    msme: string;
    iec: string;
    fssai: string;
    drugLicense: string;
  };
  financial: {
    currency: string;
    fiscalYearStart: string;
    taxStandard: string;
    decimalPlaces: number;
    priceIncludesTax: boolean;
  };
  modules: ModuleToggle[];
  logo: string;
  favicon: string;
  vendorDocumentRequirements: { key: string; mandatory: boolean }[];
};

// Build the full module-toggle list for this business: every canonical
// module key from the sidebar, merged with whatever this business already
// has saved so per-module enabled state is preserved. If the business has
// never had modules configured (empty array), default every module to
// enabled — see the read-side note in api/ui/sidebar/route.ts for why an
// empty list must mean "everything on," not "everything off."
function buildModulesForm(biz: Business): ModuleToggle[] {
  const saved = new Map(
    (Array.isArray(biz.modules) ? biz.modules : []).map((m) => [m.key, m])
  );
  return STATIC_MODULES.map((m) => {
    const existing = saved.get(m.key);
    return {
      key: m.key,
      label: m.label,
      route: m.route,
      icon: m.icon,
      // Any module not explicitly toggled off defaults to enabled — covers
      // both "never configured at all" and "configured, but this module key
      // didn't exist yet at save time."
      enabled: existing ? existing.enabled !== false : true,
    };
  });
}

function toForm(biz: Business): EditableForm {
  return {
    name: biz.name || "",
    legalName: biz.legalName || "",
    brandName: biz.brandName || "",
    businessCode: biz.businessCode || "",
    brandShortcut: biz.brandShortcut || "",
    inventorySerialized: biz.inventorySerialized || false,
    applyTaxOnB2CBilling: biz.applyTaxOnB2CBilling !== false,
    industry: biz.industry || "",
    type: biz.type || "",
    address: biz.address || "",
    city: biz.city || "",
    state: biz.state || "",
    pincode: biz.pincode || "",
    gstStateCode: biz.gstStateCode || "",
    compliance: {
      gstNumber: biz.compliance?.gstNumber || "",
      pan: biz.compliance?.pan || "",
      cin: biz.compliance?.cin || "",
      msme: biz.compliance?.msme || "",
      iec: biz.compliance?.iec || "",
      fssai: biz.compliance?.fssai || "",
      drugLicense: biz.compliance?.drugLicense || "",
    },
    financial: {
      currency: biz.financial?.currency || "INR",
      fiscalYearStart: biz.financial?.fiscalYearStart || "04-01",
      taxStandard: biz.financial?.taxStandard || "GST",
      decimalPlaces:
        typeof biz.financial?.decimalPlaces === "number"
          ? biz.financial.decimalPlaces
          : 2,
      priceIncludesTax: !!biz.financial?.priceIncludesTax,
    },
    modules: buildModulesForm(biz),
    logo: biz.logo || "",
    favicon: biz.favicon || "",
    vendorDocumentRequirements: Array.isArray(biz.vendorDocumentRequirements) ? biz.vendorDocumentRequirements : [],
  };
}

export default function BusinessDetailPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const id = typeof params?.id === "string" ? params.id : String(params?.id ?? "");

  const [form, setForm] = useState<EditableForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);

  // Uploads via the same Cloudinary pipeline already used elsewhere
  // (api/assets/upload/route.js) and stores the returned secure URL onto
  // the form so a subsequent Save Changes persists it via PATCH
  // /api/businesses/[id] (logo/favicon are in EDITABLE_FIELDS there).
  async function handleBrandingUpload(
    file: File,
    field: "logo" | "favicon",
    setUploading: (v: boolean) => void
  ) {
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", `${business?.name || "business"}-${field}`);
      fd.append("category", field);
      const res = await fetch("/api/assets/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || `Failed to upload ${field}`);
      }
      const url = data.asset?.fileUrl;
      setForm((prev) => (prev ? { ...prev, [field]: url } : prev));
    } catch (err: any) {
      setUploadError(err?.message || `Failed to upload ${field}`);
    } finally {
      setUploading(false);
    }
  }

  const {
    data: businessRes,
    isLoading: loading,
    mutate: refetchBusiness,
  } = useSWR(id ? `/api/businesses/${id}` : null);
  const business: Business | null = businessRes?.success ? businessRes.business : null;

  useEffect(() => {
    if (businessRes?.success) {
      setForm(toForm(businessRes.business));
      setError(null);
    } else if (businessRes && !businessRes.success) {
      setError(businessRes.message || "Failed to load business");
    }
  }, [businessRes]);

  const { data: meRes } = useSWR("/api/auth/me");
  const isSuperAdmin = !!meRes?.isSuperAdmin;

  const { data: logsRes, isLoading: logsLoading } = useSWR(
    id ? `/api/audit/logs?businessId=${id}` : null
  );
  const logs: AuditLogEntry[] = logsRes?.success ? logsRes.data : [];

  async function save() {
    if (!form) return;

    if (form.compliance.gstNumber.trim()) {
      const gstResult = validateGSTINAgainstState(
        form.compliance.gstNumber,
        form.state || undefined
      );
      if (!gstResult.valid) {
        setError(gstResult.reason || "Invalid GSTIN");
        return;
      }
    }

    if (form.pincode.trim() && !/^[1-9][0-9]{5}$/.test(form.pincode.trim())) {
      setError("Pincode must be a valid 6-digit Indian PIN code");
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/businesses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        refetchBusiness({ success: true, business: data.business }, false);
        setForm(toForm(data.business));
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        toast.success("Changes saved");
      } else {
        const message = data.message || "Failed to save changes";
        setError(message);
        toast.error(message);
      }
    } catch {
      setError("Failed to connect to server");
      toast.error("Failed to connect to server");
    } finally {
      setSaving(false);
    }
  }

  async function deleteBusiness() {
    if (deletingRef.current) return;
    if (
      !window.confirm(
        `Delete "${business?.name}"? This deactivates the business — it will stop appearing everywhere in the app, but its historical data is kept.`
      )
    ) {
      return;
    }

    deletingRef.current = true;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/businesses/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast.success(`Business "${business?.name}" deleted`);
        router.push("/console/business");
      } else {
        const message = data.message || "Failed to delete business";
        setError(message);
        toast.error(message);
      }
    } catch {
      setError("Failed to connect to server");
      toast.error("Failed to connect to server");
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 p-10">
        Loading business...
      </div>
    );
  }

  if (!business || !form) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 p-10">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
          {error || "Business not found"}
        </div>
        <Link
          href="/console/business"
          className="mt-4 inline-block text-cyan-700 hover:underline text-sm"
        >
          &larr; Back to businesses
        </Link>
      </div>
    );
  }

  const inputCls =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400";
  const labelCls = "block text-xs uppercase tracking-wide text-gray-400 mb-1";

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-[1800px] mx-auto px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <button
            onClick={() => router.push("/console/business")}
            className="text-xs text-cyan-700 hover:underline mb-2"
          >
            &larr; Back to businesses
          </button>
          <h1 className="text-3xl font-bold">{business.name}</h1>
          <p className="mt-1 text-sm text-gray-400">
            {[business.industry, business.type].filter(Boolean).join(" · ") ||
              "Business profile"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {business.isActive === false && (
            <span className="text-[10px] uppercase tracking-wide bg-red-50 text-red-600 font-bold px-2 py-1 rounded h-fit border border-red-200">
              Inactive
            </span>
          )}
          {isSuperAdmin && (
            <button
              onClick={deleteBusiness}
              disabled={deleting}
              className="text-sm font-medium px-4 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition disabled:opacity-40 whitespace-nowrap"
            >
              {deleting ? "Deleting…" : "Delete Business"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </div>
      )}
      {saved && (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          Changes saved.
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="font-bold text-lg">Identity</h2>
          <div>
            <label className={labelCls}>Display Name</label>
            <input
              className={inputCls}
              value={form.name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, name: e.target.value })}
              placeholder="Business display name"
            />
          </div>
          <div>
            <label className={labelCls}>Legal Name</label>
            <input
              className={inputCls}
              value={form.legalName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, legalName: e.target.value })}
              placeholder="Legal / registered name"
            />
          </div>
          <div>
            <label className={labelCls}>Brand Name</label>
            <input
              className={inputCls}
              value={form.brandName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, brandName: e.target.value })}
              placeholder="Brand name"
            />
          </div>
          <div>
            <label className={labelCls}>Business Code</label>
            <input
              className={inputCls}
              value={form.businessCode}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setForm({ ...form, businessCode: e.target.value })
              }
              placeholder="Business code"
            />
          </div>
          <div>
            <label className={labelCls}>Brand Shortcut (2-char)</label>
            <input
              className={inputCls}
              value={form.brandShortcut}
              maxLength={2}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setForm({ ...form, brandShortcut: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 2) })
              }
              placeholder="e.g. AB"
            />
            {form.brandShortcut.length === 2 && typeof window !== "undefined" && (
              <div className="mt-1.5 flex items-center gap-2">
                <p className="text-[11px] text-gray-400 truncate">
                  {`${window.location.origin}/appointment-request?code=${form.brandShortcut}`}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/appointment-request?code=${form.brandShortcut}`);
                  }}
                  className="text-[11px] text-cyan-700 hover:underline shrink-0"
                >
                  Copy link
                </button>
              </div>
            )}
          </div>

          <div>
            <label className={labelCls}>Inventory</label>
            <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.inventorySerialized}
                onChange={(e) => setForm({ ...form, inventorySerialized: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="text-sm text-gray-700">
                Serialized (check real stock and deduct on workorder close — otherwise part selection just pulls from the Service Center BOM)
              </span>
            </label>
          </div>

          <div>
            <label className={labelCls}>B2C Billing Tax</label>
            <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.applyTaxOnB2CBilling}
                onChange={(e) => setForm({ ...form, applyTaxOnB2CBilling: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="text-sm text-gray-700">
                Apply tax on B2C bills (no company name on customer). When off, walk-in bills are generated with
                no GST and always use the plain Bill number series — B2B invoices (company name present) always
                carry tax regardless of this setting.
              </span>
            </label>
          </div>

          <div>
            <label className={labelCls}>Business Type</label>
            <select
              className={inputCls}
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              title="Business type"
            >
              <option value="">Select business type…</option>
              {BUSINESS_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Industry</label>
            <select
              className={inputCls}
              value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
              title="Industry"
            >
              <option value="">Select industry…</option>
              {INDUSTRY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-2 text-xs text-gray-400 space-y-1">
            {business.email && <div>Email: {business.email}</div>}
            {business.phone && <div>Phone: {business.phone}</div>}
            {business.website && <div>Website: {business.website}</div>}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="font-bold text-lg">Address</h2>
          <div>
            <label className={labelCls}>Street Address</label>
            <input
              className={inputCls}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Street address"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>State</label>
              <StateSelect
                value={form.state}
                onChange={(value) => setForm({ ...form, state: value, city: "" })}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>City</label>
              <CitySelect
                value={form.city}
                state={form.state}
                onChange={(value) => setForm({ ...form, city: value })}
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Pincode</label>
            <PincodeInput
              value={form.pincode}
              onChange={(value) => setForm({ ...form, pincode: value })}
              onResolved={({ state, city }) =>
                setForm((prev) =>
                  prev
                    ? {
                        ...prev,
                        state: prev.state || state,
                        city: prev.city || city,
                      }
                    : prev
                )
              }
              className={inputCls}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="font-bold text-lg">Compliance</h2>
          <div>
            <label className={labelCls}>GST Number</label>
            <input
              className={inputCls}
              value={form.compliance.gstNumber}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setForm({
                  ...form,
                  compliance: { ...form.compliance, gstNumber: e.target.value },
                })
              }
              placeholder="e.g. 29ABCDE1234F1Z5"
            />
          </div>
          <div>
            <label className={labelCls}>
              GST State Code (for e-Invoice / INV-01)
            </label>
            <input
              className={inputCls}
              value={form.gstStateCode}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setForm({ ...form, gstStateCode: e.target.value })
              }
              placeholder="e.g. 29"
            />
          </div>
          <div>
            <label className={labelCls}>PAN</label>
            <input
              className={inputCls}
              value={form.compliance.pan}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setForm({
                  ...form,
                  compliance: { ...form.compliance, pan: e.target.value },
                })
              }
              placeholder="e.g. ABCDE1234F"
            />
          </div>
          <div>
            <label className={labelCls}>CIN</label>
            <input
              className={inputCls}
              value={form.compliance.cin}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setForm({
                  ...form,
                  compliance: { ...form.compliance, cin: e.target.value },
                })
              }
              placeholder="Corporate Identification Number"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>MSME</label>
              <input
                className={inputCls}
                value={form.compliance.msme}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setForm({
                    ...form,
                    compliance: { ...form.compliance, msme: e.target.value },
                  })
                }
                placeholder="MSME registration number"
              />
            </div>
            <div>
              <label className={labelCls}>IEC</label>
              <input
                className={inputCls}
                value={form.compliance.iec}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setForm({
                    ...form,
                    compliance: { ...form.compliance, iec: e.target.value },
                  })
                }
                placeholder="Import Export Code"
              />
            </div>
            <div>
              <label className={labelCls}>FSSAI</label>
              <input
                className={inputCls}
                value={form.compliance.fssai}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setForm({
                    ...form,
                    compliance: { ...form.compliance, fssai: e.target.value },
                  })
                }
                placeholder="FSSAI license number"
              />
            </div>
            <div>
              <label className={labelCls}>Drug License</label>
              <input
                className={inputCls}
                value={form.compliance.drugLicense}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setForm({
                    ...form,
                    compliance: {
                      ...form.compliance,
                      drugLicense: e.target.value,
                    },
                  })
                }
                placeholder="Drug license number"
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4 lg:col-span-2">
          <h2 className="font-bold text-lg">Financial Settings</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className={labelCls}>Currency</label>
              <input
                className={inputCls}
                value={form.financial.currency}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setForm({
                    ...form,
                    financial: { ...form.financial, currency: e.target.value },
                  })
                }
                placeholder="e.g. INR"
              />
            </div>
            <div>
              <label className={labelCls}>Fiscal Year Start</label>
              <input
                className={inputCls}
                value={form.financial.fiscalYearStart}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setForm({
                    ...form,
                    financial: {
                      ...form.financial,
                      fiscalYearStart: e.target.value,
                    },
                  })
                }
                placeholder="MM-DD"
              />
            </div>
            <div>
              <label className={labelCls}>Tax Standard</label>
              <input
                className={inputCls}
                value={form.financial.taxStandard}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setForm({
                    ...form,
                    financial: {
                      ...form.financial,
                      taxStandard: e.target.value,
                    },
                  })
                }
                placeholder="e.g. GST"
              />
            </div>
            <div>
              <label className={labelCls}>Decimal Places</label>
              <input
                type="number"
                className={inputCls}
                value={form.financial.decimalPlaces}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setForm({
                    ...form,
                    financial: {
                      ...form.financial,
                      decimalPlaces: Number(e.target.value),
                    },
                  })
                }
                onFocus={(e) => e.target.select()}
                placeholder="e.g. 2"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={form.financial.priceIncludesTax}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setForm({
                  ...form,
                  financial: {
                    ...form.financial,
                    priceIncludesTax: e.target.checked,
                  },
                })
              }
            />
            Prices include tax
          </label>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4 lg:col-span-2">
          <h2 className="font-bold text-lg">Branding</h2>
          <p className="text-xs text-gray-400">
            Logo and favicon shown on invoices and consumed by storefronts
            (e.g. Native) via GET /api/businesses/public.
          </p>
          {uploadError && (
            <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {uploadError}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Logo</label>
              <div className="flex items-center gap-3">
                {form.logo ? (
                  <img
                    src={form.logo}
                    alt="Logo preview"
                    className="h-12 w-12 rounded border border-gray-200 object-contain bg-gray-50"
                  />
                ) : (
                  <div className="h-12 w-12 rounded border border-gray-200 bg-gray-50 flex items-center justify-center text-[10px] text-gray-400">
                    None
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingLogo}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleBrandingUpload(file, "logo", setUploadingLogo);
                  }}
                  className="text-xs text-gray-600 file:mr-3 file:rounded file:border-0 file:bg-cyan-500 file:px-3 file:py-1.5 file:text-black file:text-xs file:font-bold"
                />
                {uploadingLogo && <span className="text-xs text-gray-400">Uploading…</span>}
              </div>
            </div>
            <div>
              <label className={labelCls}>Favicon</label>
              <div className="flex items-center gap-3">
                {form.favicon ? (
                  <img
                    src={form.favicon}
                    alt="Favicon preview"
                    className="h-12 w-12 rounded border border-gray-200 object-contain bg-gray-50"
                  />
                ) : (
                  <div className="h-12 w-12 rounded border border-gray-200 bg-gray-50 flex items-center justify-center text-[10px] text-gray-400">
                    None
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingFavicon}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleBrandingUpload(file, "favicon", setUploadingFavicon);
                  }}
                  className="text-xs text-gray-600 file:mr-3 file:rounded file:border-0 file:bg-cyan-500 file:px-3 file:py-1.5 file:text-black file:text-xs file:font-bold"
                />
                {uploadingFavicon && <span className="text-xs text-gray-400">Uploading…</span>}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-lg">Homepage Banners</h2>
              <p className="mt-1 text-xs text-gray-400">
                Manage the storefront's homepage hero slideshow images —
                upload, reorder, and toggle banners without touching code.
              </p>
            </div>
            <Link
              href={`/console/business/${id}/banners`}
              className="bg-gray-900 px-4 py-2 text-white font-medium rounded-xl text-sm whitespace-nowrap hover:bg-gray-800 transition"
            >
              Manage Banners
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4 lg:col-span-2">
          <h2 className="font-bold text-lg">Vendor Onboarding Documents</h2>
          <p className="text-xs text-gray-400">
            Which documents a vendor onboarding under this business must upload vs. can
            optionally attach. Unchanged docs use their catalog default (e.g. GST/PAN/MSME
            required, FSSAI/Trade License optional) — check/uncheck one here only to override
            that default for this business specifically.
          </p>
          <div className="space-y-2">
            {VENDOR_DOC_CATALOG.map((doc) => {
              const override = form.vendorDocumentRequirements.find((o) => o.key === doc.key);
              const isMandatory = override ? override.mandatory : doc.mandatoryByDefault;
              return (
                <label
                  key={doc.key}
                  className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700"
                >
                  <span>
                    {doc.label}
                    {!override && (
                      <span className="text-[10px] text-gray-400 ml-1.5">
                        (catalog default: {doc.mandatoryByDefault ? "required" : "optional"})
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="checkbox"
                      checked={isMandatory}
                      onChange={(e) => {
                        const mandatory = e.target.checked;
                        setForm({
                          ...form,
                          vendorDocumentRequirements: [
                            ...form.vendorDocumentRequirements.filter((o) => o.key !== doc.key),
                            { key: doc.key, mandatory },
                          ],
                        });
                      }}
                    />
                    <span className="text-xs">Required</span>
                  </span>
                </label>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4 lg:col-span-2">
          <h2 className="font-bold text-lg">Modules</h2>
          <p className="text-xs text-gray-400">
            Choose which application modules are available to this business.
            Unchecked modules are hidden from this business's sidebar.
          </p>
          <div className="flex flex-wrap gap-2">
            {MODULE_TEMPLATE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    modules: form.modules.map((m) => ({
                      ...m,
                      enabled: isEnabledUnderTemplate(m.key, opt.value as ModuleTemplateKey),
                    })),
                  })
                }
                className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
              >
                Apply: {opt.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {form.modules.map((mod) => (
              <label
                key={mod.key}
                className="flex items-start gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700"
              >
                <input
                  type="checkbox"
                  checked={mod.enabled}
                  className="mt-0.5"
                  onChange={(e) =>
                    setForm({
                      ...form,
                      modules: form.modules.map((m) =>
                        m.key === mod.key ? { ...m, enabled: e.target.checked } : m
                      ),
                    })
                  }
                />
                <span className="flex-1">
                  <span className="block">{mod.label}</span>
                  {/* Which business TYPES this page/data is actually for --
                      per explicit direction, so an admin has clarity while
                      configuring modules per business without needing to
                      remember or re-derive it from moduleTemplates.ts. */}
                  <span className="block text-[10px] text-gray-400">{describeBusinessUsage(mod.key)}</span>
                </span>
                {/* Per-business icon override for this module's sidebar nav
                    item -- Business.modules[].icon already exists and is
                    read by sidebar.tsx; this is just the missing UI to edit
                    it (see the Icon Library / IconPicker components). */}
                <IconPicker
                  value={mod.icon}
                  onChange={(name) =>
                    setForm({
                      ...form,
                      modules: form.modules.map((m) => (m.key === mod.key ? { ...m, icon: name } : m)),
                    })
                  }
                  className="!px-2 !py-1 shrink-0"
                />
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4 lg:col-span-2">
          <h2 className="font-bold text-lg">Product Categories</h2>
          <p className="text-xs text-gray-400">
            Which of this business's storefront categories are allowed for use right now -- an unchecked
            category is hidden from the vendor product-creation wizard's Category dropdown (and every other
            storefront-facing picker), without deleting it or its existing products. Same toggle as
            Admin &gt; Masters &gt; Product Categories, surfaced here for convenience.
          </p>
          <ProductCategoriesPanel businessId={id} />
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4 lg:col-span-2">
          <h2 className="font-bold text-lg">Document Numbering</h2>
          <p className="text-xs text-gray-400">
            Prefix, sequence, financial year and custom-template format for every document type this business
            generates -- invoices, orders, GRNs, workorders, and more. This is the one place to configure it,
            per business.
          </p>
          <DocumentNumbersPanel businessId={id} />
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4 lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-bold text-lg">Document Templates</h2>
              <p className="text-xs text-gray-400 mt-1">
                Which saved template (Admin &gt; Document Templates) this business's Invoice, Estimate, Work
                Order/Service Order and Service Record prints actually use. Fixed per business -- every print
                for this business follows whatever is selected here until changed.
              </p>
            </div>
            <a
              href={`/console/invoice-templates?businessId=${id}`}
              className="shrink-0 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition"
            >
              Manage Invoice Layouts
            </a>
          </div>
          <DocumentTemplateSelectorPanel businessId={id} />
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4 lg:col-span-2">
          <h2 className="font-bold text-lg">Activity Log</h2>
          <p className="text-xs text-gray-400">
            Recent actions taken on this business's data (creates, edits,
            deletes) across the app — most recent first, last 200 entries.
          </p>
          {logsLoading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-gray-400">No activity recorded yet.</p>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-gray-400 border-b border-gray-200">
                  <tr>
                    <th className="py-2 pr-4">When</th>
                    <th className="py-2 pr-4">Action</th>
                    <th className="py-2 pr-4">Entity</th>
                    <th className="py-2 pr-4">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log) => (
                    <tr key={log._id}>
                      <td className="py-2 pr-4 whitespace-nowrap text-gray-600">
                        {new Date(log.createdAt).toLocaleString("en-IN")}
                      </td>
                      <td className="py-2 pr-4 text-gray-700">{log.action}</td>
                      <td className="py-2 pr-4 text-gray-600">
                        {log.entity}
                        {log.entityId ? ` (${log.entityId.slice(-6)})` : ""}
                      </td>
                      <td className="py-2 pr-4 text-gray-600">
                        {log.userEmail || log.userName || (log.isSuperAdmin ? "Super Admin" : "—")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="bg-gray-900 px-6 py-3 text-white font-medium rounded-xl disabled:opacity-40 hover:bg-gray-800 transition"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
      </div>
    </div>
  );
}
