"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BUSINESS_TYPE_OPTIONS, INDUSTRY_OPTIONS } from "@/data/businessConstants";
import { StateSelect, CitySelect, PincodeInput } from "@/components/shared/LocationSelect";
import { validateGSTINAgainstState } from "@/lib/validation/gst";
import { useToast } from "@/components/shared/Toast";

export default function NewBusinessPage() {
  const router = useRouter();
  const toast = useToast();

  const [form, setForm] = useState({
    name: "",
    legalName: "",
    brandName: "",
    industry: "",
    type: "",
    email: "",
    phone: "",
    website: "",
    gstNumber: "",
    pan: "",
    address: "",
    state: "",
    city: "",
    pincode: "",
  });
  const [saving, setSaving] = useState(false);
  // React state updates aren't applied to the DOM synchronously, so a fast
  // double-click could fire createBusiness() twice before the button's
  // disabled={saving} attribute actually commits, creating two Business
  // documents. This ref is checked/set synchronously to close that window.
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [gstWarning, setGstWarning] = useState<string | null>(null);

  function handleChange(e: any) {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
      // Changing state invalidates whatever city was picked for the old state.
      ...(name === "state" ? { city: "" } : {}),
    }));
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

  async function createBusiness() {
    if (savingRef.current) return;

    if (!form.name.trim()) {
      setError("Business name is required");
      return;
    }

    if (form.gstNumber.trim()) {
      const result = validateGSTINAgainstState(form.gstNumber, form.state || undefined);
      if (!result.valid) {
        setError(result.reason || "Invalid GSTIN");
        return;
      }
    }

    if (form.pincode.trim() && !/^[1-9][0-9]{5}$/.test(form.pincode.trim())) {
      setError("Pincode must be a valid 6-digit Indian PIN code");
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);

    // Hard timeout so the button can never spin forever — if the server
    // (or DB connection) stalls, abort after 25s and show a real error.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const res = await fetch("/api/businesses/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
        signal: controller.signal,
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        toast.success(`Business "${form.name}" created`);
        // Land straight on the edit page so Super Admin can immediately pick
        // which modules this business gets (the "Modules" section already
        // there) instead of an extra click from the list page.
        router.push(`/admin/business/${data.business._id}`);
      } else {
        const message =
          data.message ||
          `Failed to create business (HTTP ${res.status}) — check the server logs / database connection`;
        setError(message);
        toast.error(message);
      }
    } catch (err: any) {
      const message =
        err?.name === "AbortError"
          ? "Request timed out after 25s — the server is not responding. Check that the database (MONGODB_URI) is reachable and restart the server."
          : "Failed to connect to server";
      setError(message);
      toast.error(message);
    } finally {
      clearTimeout(timeout);
      savingRef.current = false;
      setSaving(false);
    }
  }

  const inputClass =
    "p-3 bg-white text-gray-900 border border-gray-200 rounded placeholder:text-gray-400 w-full";
  const labelClass = "text-xs text-gray-500";

  return (
    <div className="p-10 text-gray-900 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Create Business</h1>

        <Link
          href="/admin/business"
          className="text-sm text-cyan-700 hover:text-cyan-800"
        >
          &larr; Back to Businesses
        </Link>
      </div>

      {error && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mt-6">
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Business Name *</label>
          <input
            name="name"
            value={form.name}
            placeholder="Business Name *"
            onChange={handleChange}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>Legal Name</label>
          <input
            name="legalName"
            value={form.legalName}
            placeholder="Legal Name"
            onChange={handleChange}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>Brand Name</label>
          <input
            name="brandName"
            value={form.brandName}
            placeholder="Brand Name"
            onChange={handleChange}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>Business Type</label>
          <select
            name="type"
            value={form.type}
            onChange={handleChange}
            className={inputClass}
          >
            <option value="">Select business type…</option>
            {BUSINESS_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>Industry</label>
          <select
            name="industry"
            value={form.industry}
            onChange={handleChange}
            className={inputClass}
          >
            <option value="">Select industry…</option>
            {INDUSTRY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>Email</label>
          <input
            name="email"
            value={form.email}
            placeholder="Email"
            onChange={handleChange}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>Phone</label>
          <input
            name="phone"
            value={form.phone}
            placeholder="Phone"
            onChange={handleChange}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>Website</label>
          <input
            name="website"
            value={form.website}
            placeholder="Website"
            onChange={handleChange}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1 col-span-2">
          <label className={labelClass}>Address</label>
          <input
            name="address"
            value={form.address}
            placeholder="Street address"
            onChange={handleChange}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>State</label>
          <StateSelect
            value={form.state}
            onChange={(value) =>
              setForm((prev) => ({ ...prev, state: value, city: "" }))
            }
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>City</label>
          <CitySelect
            value={form.city}
            state={form.state}
            onChange={(value) => setForm((prev) => ({ ...prev, city: value }))}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>Pincode</label>
          <PincodeInput
            value={form.pincode}
            onChange={(value) => setForm((prev) => ({ ...prev, pincode: value }))}
            onResolved={({ state, city }) =>
              setForm((prev) => ({
                ...prev,
                // Only autofill state/city if the user hasn't already
                // picked something themselves — a typed pincode shouldn't
                // silently overwrite a deliberate choice.
                state: prev.state || state,
                city: prev.city || city,
              }))
            }
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>GST Number</label>
          <input
            name="gstNumber"
            value={form.gstNumber}
            placeholder="e.g. 27AAPFU0939F1ZV"
            onChange={handleChange}
            onBlur={handleGstBlur}
            className={inputClass}
          />
          {gstWarning && (
            <span className="text-xs text-red-600 mt-1">{gstWarning}</span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>PAN</label>
          <input
            name="pan"
            value={form.pan}
            placeholder="PAN"
            onChange={handleChange}
            className={inputClass}
          />
        </div>
      </div>

      <button
        onClick={createBusiness}
        disabled={saving}
        className="mt-6 bg-cyan-600 hover:bg-cyan-700 px-6 py-3 text-white font-bold rounded disabled:opacity-50"
      >
        {saving ? "Creating..." : "Create Business"}
      </button>
    </div>
  );
}
