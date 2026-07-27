"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PincodeInput } from "@/components/shared/LocationSelect";
import { DEVICE_CATEGORIES, DEVICE_CATEGORY_LABELS } from "@/core/catalog/deviceCategory";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-2 mb-1.5">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full bg-surface border border-border-strong rounded-control px-4 py-2.5 text-sm text-ink placeholder-ink-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition";

function AppointmentRequestForm() {
  const searchParams = useSearchParams();
  const rawBusinessId = searchParams.get("businessId") || "";
  const brandShortcut = searchParams.get("code") || "";

  // Short links use ?code=AB (a business's 2-char brandShortcut) instead of the
  // full ObjectId in ?businessId= -- resolved client-side on mount so this
  // still works as a plain static link with no server rendering needed.
  //
  // A bare link with neither ?businessId= nor ?code= (e.g. the homepage's
  // plain "Book an Appointment" CTA) defaults to AN Group's own platform
  // business via /api/businesses/platform-id, rather than failing with
  // "missing business reference" -- every public entry point should
  // resolve to a real business to submit against.
  const [resolvedBusinessId, setResolvedBusinessId] = useState(rawBusinessId);
  const [resolvingCode, setResolvingCode] = useState(Boolean(!rawBusinessId));
  const [codeError, setCodeError] = useState("");

  useEffect(() => {
    if (rawBusinessId) {
      setResolvingCode(false);
      return;
    }
    if (brandShortcut) {
      (async () => {
        try {
          const res = await fetch(`/api/businesses/resolve-code?code=${encodeURIComponent(brandShortcut)}`);
          const json = await res.json();
          if (json.success) {
            setResolvedBusinessId(json.businessId);
          } else {
            setCodeError(json.message || "Invalid business code");
          }
        } catch {
          setCodeError("Failed to resolve business code");
        } finally {
          setResolvingCode(false);
        }
      })();
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/businesses/platform-id");
        const json = await res.json();
        if (json.success) {
          setResolvedBusinessId(json.businessId);
        } else {
          setCodeError(json.message || "This service is temporarily unavailable. Please try again shortly.");
        }
      } catch {
        setCodeError("This service is temporarily unavailable. Please try again shortly.");
      } finally {
        setResolvingCode(false);
      }
    })();
  }, [brandShortcut, rawBusinessId]);

  const businessId = resolvedBusinessId;

  const [form, setForm] = useState({
    customerName: "",
    phone: "",
    email: "",
    address: "",
    pincode: "",
    city: "",
    state: "",
    subject: "",
    description: "",
    deviceCategory: "",
    brandId: "",
    deviceModelId: "",
    preferredDate: "",
  });

  // Device Type -> Brand -> Model, scoped to whichever business this link
  // resolved to (see the resolvedBusinessId effect above) -- reuses the
  // same catalog APIs the internal CRM call/jobsheet forms use, kept as a
  // simpler 3-level cascade here (no Series/Variant, no "request to add"
  // flow) since this is an anonymous public form, not an authenticated
  // staff form.
  const [brands, setBrands] = useState<{ _id: string; name: string }[]>([]);
  const [models, setModels] = useState<{ _id: string; name: string }[]>([]);

  // Uses the /api/public/* catalog endpoints, not the internal /api/brands
  // and /api/device-models -- those require an authenticated session +
  // permission grant, which an anonymous visitor on this public form never
  // has. Hitting them always 401'd, and the .catch below silently reset to
  // an empty list, which is exactly why Brand/Model never populated here.
  useEffect(() => {
    if (!businessId || !form.deviceCategory) { setBrands([]); return; }
    fetch(`/api/public/brands?businessId=${businessId}&category=${form.deviceCategory}`)
      .then((r) => r.json())
      .then((d) => setBrands(d.brands || []))
      .catch(() => setBrands([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, form.deviceCategory]);

  useEffect(() => {
    if (!businessId || !form.brandId) { setModels([]); return; }
    fetch(`/api/public/device-models?businessId=${businessId}&brandId=${form.brandId}`)
      .then((r) => r.json())
      .then((d) => setModels(d.models || []))
      .catch(() => setModels([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, form.brandId]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState<string | null>(null);

  // Email OTP verification -- per explicit direction ("verify with email
  // otp and then give appointment request number"). The actual request is
  // only created after the OTP step succeeds (see submitAfterVerify()),
  // using the verificationToken issued by /verify-otp.
  const [showOtpStep, setShowOtpStep] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);

  const set = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  // Category -> Brand -> Model cascade: changing an upstream field clears
  // whichever downstream selections no longer apply, same convention as
  // the internal CRM forms' DeviceCatalogFields.
  const setDeviceCategory = (value: string) =>
    setForm((f) => ({ ...f, deviceCategory: value, brandId: "", deviceModelId: "" }));
  const setBrandId = (value: string) =>
    setForm((f) => ({ ...f, brandId: value, deviceModelId: "" }));

  const todayIso = new Date().toISOString().slice(0, 10);

  function validate(): string | null {
    if (!businessId) return "This link is missing a business reference. Please use the link provided by the business.";
    if (!form.customerName.trim() || !form.phone.trim() || !form.subject.trim()) {
      return "Please fill in your name, phone number, and what service you need.";
    }
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return "A valid email is required — we'll send a verification code to it.";
    }
    if (!form.deviceCategory || !form.brandId || !form.deviceModelId) {
      return "Please select the device type, brand, and model.";
    }
    if (!form.preferredDate) {
      return "Please pick a preferred date for us to contact you or visit.";
    }
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSendingOtp(true);
    try {
      const res = await fetch("/api/appointment-requests/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email.trim(), businessId }),
      });
      const json = await res.json();
      // The route returns HTTP success even when OTP generation succeeded
      // but the actual email failed to send (json.sent === false) -- must
      // check this explicitly, otherwise the form silently advances to
      // "enter your code" for an email that was never sent.
      if (!json.success || json.sent === false) {
        setError(json.message || "Failed to send verification code");
        return;
      }
      setOtpSent(true);
      setShowOtpStep(true);
    } catch {
      setError("Failed to send verification code. Please try again.");
    } finally {
      setSendingOtp(false);
    }
  };

  const submitAfterVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (otp.length !== 6) {
      setError("Enter the 6-digit code sent to your email");
      return;
    }
    setSubmitting(true);
    try {
      const verifyRes = await fetch("/api/appointment-requests/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email.trim(), otp }),
      });
      const verifyJson = await verifyRes.json();
      if (!verifyJson.success) {
        setError(verifyJson.message || "Invalid or expired code");
        return;
      }

      const res = await fetch("/api/appointment-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          customerName: form.customerName,
          phone: form.phone,
          email: form.email,
          address: [form.address, form.city, form.state].filter(Boolean).join(", "),
          pincode: form.pincode,
          subject: form.subject,
          description: form.description,
          deviceCategory: form.deviceCategory,
          brandId: form.brandId,
          deviceModelId: form.deviceModelId,
          preferredDate: form.preferredDate,
          verificationToken: verifyJson.verificationToken,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.message || "Failed to submit request");
        return;
      }
      setReference(json.referenceNumber);
    } catch {
      setError("Failed to submit request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (resolvingCode) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center text-sm text-ink-3">
        Loading...
      </div>
    );
  }

  if (codeError) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-surface border border-border rounded-card p-8 text-center">
          <p className="text-sm text-danger">{codeError}</p>
        </div>
      </div>
    );
  }

  if (reference) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-surface border border-border rounded-card p-8 text-center">
          <h1 className="text-lg font-semibold text-ink mb-2">
            Request submitted
          </h1>
          <p className="text-sm text-ink-3 mb-4">
            We&apos;ve received your appointment request. Your reference number is:
          </p>
          <p className="text-xl font-mono font-bold text-ink mb-4">{reference}</p>
          <p className="text-xs text-ink-3">
            Please quote this number if you contact us about this request.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg py-10 px-4">
      <div className="max-w-xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-ink">Request an Appointment</h1>
          <p className="text-sm text-ink-3 mt-1">
            Tell us what you need and we&apos;ll get in touch to schedule a visit.
          </p>
        </div>

        {!showOtpStep ? (
          <form
            onSubmit={handleSubmit}
            className="bg-surface border border-border rounded-card p-6 space-y-4"
          >
            {error && (
              <div className="px-4 py-3 rounded-control bg-danger-soft border border-danger/20 text-danger text-sm">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Full Name" required>
                <input
                  className={inputCls}
                  value={form.customerName}
                  onChange={(e) => set("customerName", e.target.value)}
                  placeholder="Your name"
                />
              </Field>
              <Field label="Phone Number" required>
                <input
                  className={inputCls}
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="+91 98765 43210"
                  type="tel"
                />
              </Field>
              <Field label="Email" required>
                <input
                  className={inputCls}
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="you@example.com"
                  type="email"
                />
              </Field>
              <Field label="Pincode">
                <PincodeInput
                  value={form.pincode}
                  onChange={(v) => set("pincode", v)}
                  onResolved={({ state, city }) => {
                    set("state", state);
                    set("city", city);
                  }}
                  className={inputCls}
                  placeholder="400001"
                />
              </Field>
              {(form.city || form.state) && (
                <div className="md:col-span-2 text-xs text-ink-3">
                  {[form.city, form.state].filter(Boolean).join(", ")}
                </div>
              )}
              <div className="md:col-span-2">
                <Field label="Address">
                  <input
                    className={inputCls}
                    value={form.address}
                    onChange={(e) => set("address", e.target.value)}
                    placeholder="Street / Area"
                  />
                </Field>
              </div>
              <Field label="Device Type" required>
                <select
                  className={inputCls}
                  value={form.deviceCategory}
                  onChange={(e) => setDeviceCategory(e.target.value)}
                >
                  <option value="">Select device type…</option>
                  {DEVICE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{DEVICE_CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Brand" required>
                <select
                  className={inputCls}
                  value={form.brandId}
                  onChange={(e) => setBrandId(e.target.value)}
                  disabled={!form.deviceCategory}
                >
                  <option value="">{!form.deviceCategory ? "Select a device type first" : "Select brand…"}</option>
                  {brands.map((b) => (
                    <option key={b._id} value={b._id}>{b.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Model" required>
                <select
                  className={inputCls}
                  value={form.deviceModelId}
                  onChange={(e) => set("deviceModelId", e.target.value)}
                  disabled={!form.brandId}
                >
                  <option value="">{!form.brandId ? "Select a brand first" : "Select model…"}</option>
                  {models.map((m) => (
                    <option key={m._id} value={m._id}>{m.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Preferred Date" required>
                <input
                  type="date"
                  className={inputCls}
                  min={todayIso}
                  value={form.preferredDate}
                  onChange={(e) => set("preferredDate", e.target.value)}
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="What service do you need?" required>
                  <input
                    className={inputCls}
                    value={form.subject}
                    onChange={(e) => set("subject", e.target.value)}
                    placeholder="e.g. AC not cooling"
                  />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Additional Details">
                  <textarea
                    className={inputCls}
                    rows={3}
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="Any other details that might help us"
                  />
                </Field>
              </div>
            </div>

            <button
              type="submit"
              disabled={sendingOtp}
              className="w-full py-3 rounded-control bg-accent hover:bg-accent-hover text-accent-fg text-sm font-medium transition disabled:opacity-50"
            >
              {sendingOtp ? "Sending code..." : "Verify Email & Continue"}
            </button>
          </form>
        ) : (
          <form
            onSubmit={submitAfterVerify}
            className="bg-surface border border-border rounded-card p-6 space-y-4"
          >
            {error && (
              <div className="px-4 py-3 rounded-control bg-danger-soft border border-danger/20 text-danger text-sm">
                {error}
              </div>
            )}

            <p className="text-sm text-ink-2">
              {otpSent ? "We've sent a 6-digit code to " : "Enter the code sent to "}
              <span className="font-medium text-ink">{form.email}</span>
            </p>

            <Field label="Verification Code" required>
              <input
                className={`${inputCls} tracking-widest text-center text-lg`}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                maxLength={6}
                autoFocus
              />
            </Field>

            <button
              type="submit"
              disabled={submitting || otp.length !== 6}
              className="w-full py-3 rounded-control bg-accent hover:bg-accent-hover text-accent-fg text-sm font-medium transition disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Verify & Submit Request"}
            </button>

            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => {
                  setShowOtpStep(false);
                  setOtp("");
                  setError("");
                }}
                className="text-ink-3 hover:text-ink-2 underline"
              >
                ← Edit details
              </button>
              <button
                type="button"
                disabled={sendingOtp}
                onClick={() => handleSubmit({ preventDefault: () => {} } as React.FormEvent)}
                className="text-ink-3 hover:text-ink-2 underline disabled:opacity-50"
              >
                {sendingOtp ? "Resending..." : "Resend code"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function AppointmentRequestPage() {
  return (
    <Suspense fallback={null}>
      <AppointmentRequestForm />
    </Suspense>
  );
}
