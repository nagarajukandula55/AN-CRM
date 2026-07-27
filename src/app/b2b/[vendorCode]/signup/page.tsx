"use client";

import { useEffect, useState, use as usePromise } from "react";
import Link from "next/link";

const EMPTY = { name: "", type: "RETAILER" as const, contactPerson: "", phone: "", email: "", password: "" };

export default function B2BSignupPage({ params }: { params: Promise<{ vendorCode: string }> }) {
  const { vendorCode } = usePromise(params);
  const [vendorName, setVendorName] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/b2b/${vendorCode}/info`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setVendorName(d.vendor.companyName);
        else setNotFound(true);
      });
  }, [vendorCode]);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/b2b/${vendorCode}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Signup failed");
        return;
      }
      setSuccess(true);
    } finally {
      setLoading(false);
    }
  }

  if (notFound) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">B2B ordering isn't available for this vendor.</div>;
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="w-full max-w-sm bg-white rounded-xl border p-6 text-center space-y-2">
          <h1 className="text-lg font-semibold text-gray-900">Signup Received</h1>
          <p className="text-sm text-gray-500">
            {vendorName} will review your account and set your credit terms. You'll be able to log in once approved.
          </p>
          <Link href={`/b2b/${vendorCode}/login`} className="text-violet-600 text-sm">Go to login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-xl border p-6 space-y-3">
        <h1 className="text-lg font-semibold text-gray-900">Become a {vendorName || "..."} Partner</h1>
        <p className="text-xs text-gray-500">Sign up as a Distributor or Retailer to order directly at your channel price.</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <input className="w-full border rounded-lg p-2 text-sm" placeholder="Business name *" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
        <select className="w-full border rounded-lg p-2 text-sm" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as any }))}>
          <option value="RETAILER">Retailer</option>
          <option value="DISTRIBUTOR">Distributor</option>
        </select>
        <input className="w-full border rounded-lg p-2 text-sm" placeholder="Contact person" value={form.contactPerson} onChange={(e) => setForm((p) => ({ ...p, contactPerson: e.target.value }))} />
        <input className="w-full border rounded-lg p-2 text-sm" placeholder="Phone" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
        <input className="w-full border rounded-lg p-2 text-sm" placeholder="Email *" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
        <input type="password" className="w-full border rounded-lg p-2 text-sm" placeholder="Password (min 6 chars) *" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
        <button onClick={submit} disabled={loading} className="w-full py-2 bg-gray-900 text-white rounded-lg text-sm disabled:opacity-50">
          {loading ? "Submitting…" : "Sign Up"}
        </button>
        <p className="text-xs text-gray-500 text-center">
          Already approved? <Link href={`/b2b/${vendorCode}/login`} className="text-violet-600">Log in</Link>
        </p>
      </div>
    </div>
  );
}
