"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { StateSelect, CitySelect, PincodeInput } from "@/components/shared/LocationSelect";
import { validateGSTINAgainstState } from "@/lib/validation/gst";
import { getComplianceDocsForIndustry, getVendorDocRequirements, type ComplianceDocRequirement } from "@/core/vendorCompliance";

// GST + PAN already have dedicated cards below (tied to the gstRegistered
// toggle) -- excluded from the dynamic catalog rendering so they're never
// shown twice.
const EXCLUDE_FROM_CATALOG_RENDER = new Set(["gst_certificate", "pan_card"]);

function Field({
  label,
  required,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

const inputCls =
  "w-full bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-500 transition";

function UploadDropzone({
  uploading,
  uploadedUrl,
  onFile,
}: {
  uploading: boolean;
  uploadedUrl?: string;
  onFile: (file: File) => void;
}) {
  return (
    <label
      className={`flex items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 text-xs cursor-pointer transition ${
        uploading
          ? "border-gray-200 bg-gray-50 opacity-60"
          : uploadedUrl
          ? "border-emerald-300 bg-emerald-50"
          : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
      }`}
    >
      <span className={uploadedUrl ? "text-emerald-700 font-medium" : "text-gray-500"}>
        {uploading ? "Uploading…" : uploadedUrl ? "Uploaded — click to replace" : "Click to upload (PDF/image, max 10MB)"}
      </span>
      <input
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </label>
  );
}

function DocUploadCard({
  label,
  hint,
  state,
  onUpload,
}: {
  label: string;
  hint?: string;
  state: { url?: string; uploading?: boolean };
  onUpload: (file: File) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <p className="text-xs font-medium text-gray-700 mb-1">{label}</p>
      {hint && <p className="text-[10px] text-gray-400 mb-2">{hint}</p>}
      <UploadDropzone uploading={!!state.uploading} uploadedUrl={state.url} onFile={onUpload} />
    </div>
  );
}

function VendorApplyForm() {
  const searchParams = useSearchParams();
  // businessId is now OPTIONAL — an admin-shared link
  // (/vendor-apply?businessId=...) still pre-targets one business exactly
  // as before, but a vendor arriving here directly (e.g. from a public
  // "Become a vendor" link with no businessId) can now submit a general
  // signup request; the admin assigns a business at approval time.
  const businessId = searchParams.get("businessId") || "";

  const [businessName, setBusinessName] = useState<string | null>(null);
  const [businessIndustry, setBusinessIndustry] = useState<string | null>(null);
  const [businessDocOverrides, setBusinessDocOverrides] = useState<{ key: string; mandatory: boolean }[]>([]);
  const [invalidLink, setInvalidLink] = useState(false);

  const [form, setForm] = useState({
    companyName: "",
    contactPerson: "",
    email: "",
    username: "",
    phone: "",
    gstRegistered: true,
    gstNumber: "",
    panNumber: "",
    category: "",
    businessType: "",
    street: "",
    city: "",
    state: "",
    pincode: "",
    accountName: "",
    accountNumber: "",
    confirmAccount: "",
    ifscCode: "",
    bankName: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ requestNumber: string; businessName?: string } | null>(null);
  const [gstWarning, setGstWarning] = useState<string | null>(null);
  // Validated against an EXISTING User account (created via /register
  // beforehand) -- a vendor application no longer creates a login inline,
  // it links to one the applicant already registered.
  const [userIdCheck, setUserIdCheck] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [userIdCheckedName, setUserIdCheckedName] = useState<string | null>(null);

  // Generic supporting documents every applicant is asked for, regardless
  // of business/industry (which isn't known yet for a general request).
  const [gstDoc, setGstDoc] = useState<{ url?: string; uploading?: boolean }>({});
  const [panDoc, setPanDoc] = useState<{ url?: string; uploading?: boolean }>({});
  const [regDoc, setRegDoc] = useState<{ url?: string; uploading?: boolean }>({});
  // Industry-specific compliance docs — only shown/collected when a
  // specific business (and therefore its industry) is already known via
  // the businessId link.
  const [complianceUploads, setComplianceUploads] = useState<Record<string, { url?: string; number?: string; uploading?: boolean }>>({});
  const industryComplianceDocs = getComplianceDocsForIndustry(businessIndustry);
  const { required: requiredCatalogDocs, optional: optionalCatalogDocs } = getVendorDocRequirements(businessDocOverrides);
  const catalogRequiredDocs = requiredCatalogDocs.filter((d) => !EXCLUDE_FROM_CATALOG_RENDER.has(d.key));
  const catalogOptionalDocs = optionalCatalogDocs.filter((d) => !EXCLUDE_FROM_CATALOG_RENDER.has(d.key));
  const requiredComplianceDocs = [...catalogRequiredDocs, ...industryComplianceDocs];

  useEffect(() => {
    if (!businessId) return; // general request — no link to validate
    fetch(`/api/businesses/public?businessId=${businessId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setBusinessName(d.business.name);
          setBusinessIndustry(d.business.industry || null);
          setBusinessDocOverrides(d.business.vendorDocumentRequirements || []);
        } else {
          setInvalidLink(true);
        }
      })
      .catch(() => setInvalidLink(true));
  }, [businessId]);

  async function uploadGenericDoc(
    setter: (v: { url?: string; uploading?: boolean }) => void,
    file: File
  ) {
    setter({ uploading: true });
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/vendors/apply/upload-document", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Upload failed");
      setter({ url: data.asset?.fileUrl, uploading: false });
    } catch {
      setter({ uploading: false });
    }
  }

  async function uploadComplianceDoc(doc: ComplianceDocRequirement, file: File) {
    setComplianceUploads((prev) => ({ ...prev, [doc.key]: { ...prev[doc.key], uploading: true } }));
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/vendors/apply/upload-document", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Upload failed");
      setComplianceUploads((prev) => ({ ...prev, [doc.key]: { ...prev[doc.key], url: data.asset?.fileUrl, uploading: false } }));
    } catch {
      setComplianceUploads((prev) => ({ ...prev, [doc.key]: { ...prev[doc.key], uploading: false } }));
    }
  }

  async function checkUserId() {
    const uname = form.username.trim().toLowerCase();
    if (!uname) {
      setUserIdCheck("idle");
      setUserIdCheckedName(null);
      return;
    }
    setUserIdCheck("checking");
    try {
      const res = await fetch(`/api/users/lookup?username=${encodeURIComponent(uname)}`);
      const data = await res.json();
      if (data.success && data.exists) {
        setUserIdCheck("valid");
        setUserIdCheckedName(data.name || null);
      } else {
        setUserIdCheck("invalid");
        setUserIdCheckedName(null);
      }
    } catch {
      setUserIdCheck("invalid");
      setUserIdCheckedName(null);
    }
  }

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((p) => ({ ...p, [key]: value }));
    if (error) setError(null);
  }

  function handleGstBlur() {
    if (!form.gstNumber.trim()) {
      setGstWarning(null);
      return;
    }
    const result = validateGSTINAgainstState(form.gstNumber, form.state || undefined);
    setGstWarning(result.valid ? null : result.reason || "Invalid GSTIN");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.companyName.trim()) return setError("Company name is required");
    if (!form.contactPerson.trim()) return setError("Contact person is required");
    if (!form.email.trim()) return setError("Email is required");
    if (!form.phone.trim()) return setError("Phone is required");
    if (!form.username.trim())
      return setError("User ID is required — register an account first at /register, then enter it here");
    if (userIdCheck !== "valid")
      return setError("Please enter a valid, already-registered User ID (click outside the field to check)");
    if (form.gstRegistered && !form.gstNumber.trim())
      return setError("GSTIN is required for GST-registered vendors");
    if (!form.gstRegistered && !form.panNumber.trim())
      return setError("PAN is required for vendors without GST");
    if (form.gstNumber.trim()) {
      const gstResult = validateGSTINAgainstState(form.gstNumber, form.state || undefined);
      if (!gstResult.valid) return setError(gstResult.reason || "Invalid GSTIN");
    }
    if (form.pincode.trim() && !/^[1-9][0-9]{5}$/.test(form.pincode.trim()))
      return setError("Pincode must be a valid 6-digit Indian PIN code");
    if (form.accountNumber && form.accountNumber !== form.confirmAccount)
      return setError("Account numbers do not match");
    const missingCompliance = requiredComplianceDocs.filter((d) => !complianceUploads[d.key]?.url);
    if (missingCompliance.length > 0) {
      return setError(`Please upload: ${missingCompliance.map((d) => d.label).join(", ")}`);
    }

    setSubmitting(true);
    setError(null);
    try {
      const complianceEntries: Record<string, { url?: string; number?: string; uploadedAt: string }> = {};
      for (const key of Object.keys(complianceUploads)) {
        const v = complianceUploads[key];
        if (v.url) complianceEntries[key] = { url: v.url, number: v.number, uploadedAt: new Date().toISOString() };
      }
      const documents = {
        gstCertificateUrl: gstDoc.url || undefined,
        compliance: {
          ...(panDoc.url ? { pan_card: { url: panDoc.url, uploadedAt: new Date().toISOString() } } : {}),
          ...(regDoc.url ? { business_registration: { url: regDoc.url, uploadedAt: new Date().toISOString() } } : {}),
          ...complianceEntries,
        },
      };

      const res = await fetch("/api/vendors/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: businessId || undefined,
          companyName: form.companyName.trim(),
          contactPerson: form.contactPerson.trim(),
          email: form.email.trim(),
          userId: form.username.trim(),
          phone: form.phone.trim(),
          gstRegistered: form.gstRegistered,
          gstNumber: form.gstRegistered ? form.gstNumber.trim().toUpperCase() : undefined,
          panNumber: panDoc.url || form.panNumber ? form.panNumber.trim().toUpperCase() || undefined : undefined,
          category: form.category || undefined,
          businessType: form.businessType || undefined,
          address:
            form.street || form.city || form.state || form.pincode
              ? {
                  street: form.street || undefined,
                  city: form.city || undefined,
                  state: form.state || undefined,
                  pincode: form.pincode || undefined,
                  country: "India",
                }
              : undefined,
          bankDetails: form.accountNumber
            ? {
                accountName: form.accountName || undefined,
                accountNumber: form.accountNumber,
                ifscCode: form.ifscCode.trim().toUpperCase() || undefined,
                bankName: form.bankName || undefined,
              }
            : undefined,
          documents,
          notes: form.notes || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.message || "Submission failed");
      setDone({ requestNumber: d.requestNumber || d.applicationId, businessName: d.business });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (invalidLink) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md text-center">
          <h1 className="text-lg font-bold text-gray-900">Invalid application link</h1>
          <p className="mt-2 text-sm text-gray-500">
            This vendor application link is missing or invalid. Please use the exact
            link shared with you by the business admin.
          </p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md text-center">
          <div className="text-4xl mb-3">✅</div>
          <h1 className="text-lg font-bold text-gray-900">Application submitted</h1>
          <p className="mt-2 text-sm text-gray-500">
            Your request number is <span className="font-mono font-semibold text-gray-800">{done.requestNumber}</span>
            {done.businessName ? <> for <strong>{done.businessName}</strong></> : null}.
            Please quote this number in any follow-up. The team will review your
            documents{!businessId ? ", assign you to the appropriate business," : ""} and
            send you the partner agreement for signing. You&apos;ll receive your vendor
            login after final approval.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <form onSubmit={submit} className="mx-auto max-w-2xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-gray-400 font-semibold">Vendor Onboarding</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">
            {businessName ? `Apply as a vendor — ${businessName}` : "Vendor Application"}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Fill in your company details. After review you&apos;ll receive a partner
            agreement to sign, and your vendor login once approved.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Company */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Company Name" required>
            <input className={inputCls} value={form.companyName} onChange={(e) => set("companyName", e.target.value)} placeholder="Acme Traders Pvt Ltd" />
          </Field>
          <Field label="Business Type">
            <select className={inputCls} value={form.businessType} onChange={(e) => set("businessType", e.target.value)}>
              <option value="">Select…</option>
              {["Manufacturer", "Wholesaler", "Distributor", "Retailer", "Service Provider", "Other"].map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </Field>
          <Field label="Contact Person" required>
            <input className={inputCls} value={form.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} placeholder="Full name" />
          </Field>
          <Field label="Category">
            <input className={inputCls} value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Packaging, Raw Material" />
          </Field>
          <Field label="Email" required>
            <input type="email" className={inputCls} value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@company.com" />
          </Field>
          <Field label="Phone" required>
            <input className={inputCls} value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="98765 43210" />
          </Field>
          <Field
            label="User ID"
            required
            hint={
              userIdCheck === "checking"
                ? "Checking…"
                : userIdCheck === "valid"
                ? `Matched: ${userIdCheckedName || "registered account"}`
                : userIdCheck === "invalid"
                ? "No registered account with this User ID"
                : "Don't have one yet? Register first, then come back with your User ID."
            }
          >
            <input
              className={inputCls}
              value={form.username}
              onChange={(e) => {
                set("username", e.target.value.toLowerCase().replace(/\s+/g, ""));
                setUserIdCheck("idle");
              }}
              onBlur={checkUserId}
              placeholder="e.g. acmetraders"
            />
            <Link href="/register" target="_blank" className="text-[10px] text-cyan-700 hover:underline mt-1 inline-block">
              Don&apos;t have an account? Register here →
            </Link>
          </Field>
        </div>

        {/* GST toggle */}
        <div>
          <p className="text-xs font-medium text-gray-600 mb-2">GST Registration<span className="text-red-500 ml-0.5">*</span></p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => set("gstRegistered", true)}
              className={`py-2.5 rounded-xl border text-sm font-medium transition ${
                form.gstRegistered
                  ? "bg-gray-900 border-gray-900 text-white"
                  : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
              }`}
            >
              With GST
            </button>
            <button
              type="button"
              onClick={() => set("gstRegistered", false)}
              className={`py-2.5 rounded-xl border text-sm font-medium transition ${
                !form.gstRegistered
                  ? "bg-gray-900 border-gray-900 text-white"
                  : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
              }`}
            >
              Without GST
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {form.gstRegistered && (
            <Field label="GSTIN" required hint={gstWarning || "15-character GST identification number"}>
              <input
                className={inputCls}
                value={form.gstNumber}
                onChange={(e) => set("gstNumber", e.target.value)}
                onBlur={handleGstBlur}
                placeholder="22AAAAA0000A1Z5"
              />
            </Field>
          )}
          <Field label="PAN" required={!form.gstRegistered} hint={form.gstRegistered ? "Optional when GSTIN is provided" : "Required for vendors without GST"}>
            <input className={inputCls} value={form.panNumber} onChange={(e) => set("panNumber", e.target.value)} placeholder="AAAAA0000A" />
          </Field>
        </div>

        {/* Address */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Registered Address</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Street"><input className={inputCls} value={form.street} onChange={(e) => set("street", e.target.value)} /></Field>
            <Field label="State">
              <StateSelect
                value={form.state}
                onChange={(value) => {
                  set("state", value);
                  set("city", "");
                }}
                className={inputCls}
              />
            </Field>
            <Field label="City">
              <CitySelect
                value={form.city}
                state={form.state}
                onChange={(value) => set("city", value)}
                className={inputCls}
              />
            </Field>
            <Field label="Pincode">
              <PincodeInput
                value={form.pincode}
                onChange={(value) => set("pincode", value)}
                onResolved={({ state, city }) => {
                  // Only autofill if not already set — don't clobber a deliberate user choice
                  setForm((prev) => ({
                    ...prev,
                    state: prev.state || state,
                    city: prev.city || city,
                  }));
                }}
                className={inputCls}
              />
            </Field>
          </div>
        </div>

        {/* Bank */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Bank Details (for payouts)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Account Holder Name"><input className={inputCls} value={form.accountName} onChange={(e) => set("accountName", e.target.value)} /></Field>
            <Field label="Bank Name"><input className={inputCls} value={form.bankName} onChange={(e) => set("bankName", e.target.value)} /></Field>
            <Field label="Account Number"><input className={inputCls} value={form.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} /></Field>
            <Field label="Confirm Account Number"><input className={inputCls} value={form.confirmAccount} onChange={(e) => set("confirmAccount", e.target.value)} /></Field>
            <Field label="IFSC Code"><input className={inputCls} value={form.ifscCode} onChange={(e) => set("ifscCode", e.target.value)} placeholder="HDFC0001234" /></Field>
          </div>
        </div>

        {/* Documents */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Supporting Documents</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DocUploadCard
              label="GST Certificate"
              hint={form.gstRegistered ? "Required for GST-registered vendors" : "Optional"}
              state={gstDoc}
              onUpload={(file) => uploadGenericDoc(setGstDoc, file)}
            />
            <DocUploadCard
              label="PAN Card"
              hint={!form.gstRegistered ? "Required for vendors without GST" : "Optional"}
              state={panDoc}
              onUpload={(file) => uploadGenericDoc(setPanDoc, file)}
            />
            <DocUploadCard
              label="Business Registration / Incorporation Certificate"
              hint="Optional, but speeds up review"
              state={regDoc}
              onUpload={(file) => uploadGenericDoc(setRegDoc, file)}
            />
          </div>

          <div className="mt-4 space-y-3">
            <p className="text-xs font-medium text-gray-700">Required documents — this business's settings</p>
            {catalogRequiredDocs.map((doc) => {
              const uploaded = complianceUploads[doc.key];
              return (
                <div key={doc.key} className="rounded-xl border border-gray-200 p-4">
                  <p className="text-sm font-medium text-gray-900">
                    {doc.label}
                    <span className="text-red-500 ml-0.5">*</span>
                  </p>
                  {doc.helpText && <p className="text-[11px] text-gray-400 mt-0.5 mb-2">{doc.helpText}</p>}
                  {doc.collectNumber && (
                    <input
                      type="text"
                      placeholder={doc.numberLabel || "License number"}
                      value={uploaded?.number || ""}
                      onChange={(e) =>
                        setComplianceUploads((prev) => ({ ...prev, [doc.key]: { ...prev[doc.key], number: e.target.value } }))
                      }
                      className={`${inputCls} mb-2`}
                    />
                  )}
                  <UploadDropzone
                    uploading={!!uploaded?.uploading}
                    uploadedUrl={uploaded?.url}
                    onFile={(file) => uploadComplianceDoc(doc, file)}
                  />
                </div>
              );
            })}
          </div>

          {industryComplianceDocs.length > 0 && (
            <div className="mt-4 space-y-3">
              <p className="text-xs font-medium text-gray-700">
                Required documents for {businessName}&apos;s industry
              </p>
              {industryComplianceDocs.map((doc) => {
                const uploaded = complianceUploads[doc.key];
                return (
                  <div key={doc.key} className="rounded-xl border border-gray-200 p-4">
                    <p className="text-sm font-medium text-gray-900">
                      {doc.label}
                      <span className="text-red-500 ml-0.5">*</span>
                    </p>
                    {doc.helpText && <p className="text-[11px] text-gray-400 mt-0.5 mb-2">{doc.helpText}</p>}
                    {doc.collectNumber && (
                      <input
                        type="text"
                        placeholder={doc.numberLabel || "License number"}
                        value={uploaded?.number || ""}
                        onChange={(e) =>
                          setComplianceUploads((prev) => ({ ...prev, [doc.key]: { ...prev[doc.key], number: e.target.value } }))
                        }
                        className={`${inputCls} mb-2`}
                      />
                    )}
                    <UploadDropzone
                      uploading={!!uploaded?.uploading}
                      uploadedUrl={uploaded?.url}
                      onFile={(file) => uploadComplianceDoc(doc, file)}
                    />
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 space-y-3">
            <p className="text-xs font-medium text-gray-700">Optional documents</p>
            {catalogOptionalDocs.map((doc) => {
              const uploaded = complianceUploads[doc.key];
              return (
                <div key={doc.key} className="rounded-xl border border-gray-200 p-4">
                  <p className="text-sm font-medium text-gray-900">{doc.label}</p>
                  {doc.helpText && <p className="text-[11px] text-gray-400 mt-0.5 mb-2">{doc.helpText}</p>}
                  {doc.collectNumber && (
                    <input
                      type="text"
                      placeholder={doc.numberLabel || "License number"}
                      value={uploaded?.number || ""}
                      onChange={(e) =>
                        setComplianceUploads((prev) => ({ ...prev, [doc.key]: { ...prev[doc.key], number: e.target.value } }))
                      }
                      className={`${inputCls} mb-2`}
                    />
                  )}
                  <UploadDropzone
                    uploading={!!uploaded?.uploading}
                    uploadedUrl={uploaded?.url}
                    onFile={(file) => uploadComplianceDoc(doc, file)}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <Field label="Anything else we should know?">
          <textarea className={`${inputCls} min-h-[80px]`} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 transition"
        >
          {submitting ? "Submitting…" : "Submit Application"}
        </button>
      </form>
    </div>
  );
}

export default function VendorApplyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">
          Loading…
        </div>
      }
    >
      <VendorApplyForm />
    </Suspense>
  );
}
