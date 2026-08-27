"use client";

import { useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function B2BLoginPage({ params }: { params: Promise<{ vendorCode: string }> }) {
  const { vendorCode } = usePromise(params);
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function login() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/b2b/${vendorCode}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Login failed");
        return;
      }
      router.push(`/b2b/${vendorCode}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-surface-2">
      <div className="w-full max-w-sm bg-surface rounded-card border p-6 space-y-3">
        <h1 className="text-lg font-semibold text-ink">Partner Login</h1>
        {error && <p className="text-sm text-danger">{error}</p>}
        <input
          className="w-full border rounded-control p-2 text-sm"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
        />
        <input
          type="password"
          className="w-full border rounded-control p-2 text-sm"
          placeholder="Password"
          value={form.password}
          onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
        />
        <button onClick={login} disabled={loading} className="w-full py-2 bg-accent text-accent-fg rounded-control text-sm disabled:opacity-50">
          {loading ? "Signing in…" : "Sign In"}
        </button>
        <p className="text-xs text-ink-3 text-center">
          New here? <Link href={`/b2b/${vendorCode}/signup`} className="text-blue-600">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
