"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Eye,
  EyeOff,
  Loader2,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { StateSelect, CitySelect, PincodeInput } from "@/components/shared/LocationSelect";
import { validateGSTINAgainstState } from "@/lib/validation/gst";
import Logo from "@/components/marketing/Logo";
import {
  neonButtonPrimary,
  neonPageBg,
  neonGlow,
  neonGradientText,
  neonInputCls,
  neonLabelCls,
  neonCard,
} from "@/components/marketing/theme";

const BUSINESS_CATEGORIES = [
  "Manufacturing",
  "Trading",
  "Services",
  "Logistics",
  "Technology",
  "Retail",
  "Agriculture",
  "Construction",
  "Healthcare",
  "Education",
  "Other",
];

type Step = 1 | 2;
type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "accountFailed"; message: string }
  | {
      kind: "vendorFailed";
      message: string;
      username: string;
    }
  | { kind: "success"; username: string; requestNumber?: string };

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className={neonLabelCls}>
        {label} {required && <span className="text-pink-500">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[10px] text-gray-400">{hint}</p>}
    </div>
  );
}

function PasswordInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "••••••••"}
        className={`${neonInputCls} pr-10`}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-violet-600 transition-colors"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export default function PartnerSignupPage() {
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState("");
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  // Step 1 — account fields, mirroring /register's customer form.
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Step 2 — business fields, mirroring the core fields of /vendor-apply.
  const [companyName, setCompanyName] = useState("");
  const [contactPerson, setContactPerson] = useState(fullName);
  const [category, setCategory] = useState("");
  const [gstRegistered, setGstRegistered] = useState(true);
  const [gstNumber, setGstNumber] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [street, setStreet] = useState("");
  const [addrState, setAddrState] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  const [notes, setNotes] = useState("");
  const [gstWarning, setGstWarning] = useState<string | null>(null);

  function validateStep1(): string | null {
    if (!fullName.trim() || !email.trim() || !password) {
      return "Please fill in all required fields";
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) return "Invalid email address";
    if (password.length < 8) return "Password must be at least 8 characters long";
    if (password !== confirmPassword) return "Passwords do not match";
    return null;
  }

  function handleGstBlur() {
    if (!gstNumber.trim()) {
      setGstWarning(null);
      return;
    }
    const result = validateGSTINAgainstState(gstNumber, addrState || undefined);
    setGstWarning(result.valid ? null : result.reason || "Invalid GSTIN");
  }

  function validateStep2(): string | null {
    if (!companyName.trim()) return "Company name is required";
    if (!contactPerson.trim()) return "Contact person is required";
    if (gstRegistered && !gstNumber.trim()) return "GSTIN is required for GST-registered businesses";
    if (!gstRegistered && !panNumber.trim()) return "PAN is required for businesses without GST";
    if (gstNumber.trim()) {
      const result = validateGSTINAgainstState(gstNumber, addrState || undefined);
      if (!result.valid) return result.reason || "Invalid GSTIN";
    }
    if (pincode.trim() && !/^[1-9][0-9]{5}$/.test(pincode.trim())) {
      return "Pincode must be a valid 6-digit Indian PIN code";
    }
    return null;
  }

  function goToStep2() {
    setError("");
    const err = validateStep1();
    if (err) {
      setError(err);
      return;
    }
    if (!contactPerson.trim()) setContactPerson(fullName);
    setStep(2);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const err = validateStep2();
    if (err) {
      setError(err);
      return;
    }

    setState({ kind: "submitting" });
    try {
      // Step A — create the account via the exact same endpoint /register
      // uses. Response shape: { success, message, userId, username }.
      const registerRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fullName,
          email,
          password,
          phone,
        }),
      });
      const registerData = await registerRes.json();
      if (!registerData.success) {
        setState({
          kind: "accountFailed",
          message: registerData.message || "Account creation failed. Please try again.",
        });
        return;
      }

      const username: string = registerData.username;

      // Step B — submit the vendor application, threading the just-created
      // account's username through as /api/vendors/apply's required `userId`.
      try {
        const vendorRes = await fetch("/api/vendors/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: username,
            companyName: companyName.trim(),
            contactPerson: contactPerson.trim(),
            email: email.trim(),
            phone: phone.trim(),
            gstRegistered,
            gstNumber: gstRegistered ? gstNumber.trim().toUpperCase() : undefined,
            panNumber: panNumber.trim() ? panNumber.trim().toUpperCase() : undefined,
            category: category || undefined,
            address:
              street || city || addrState || pincode
                ? {
                    street: street || undefined,
                    city: city || undefined,
                    state: addrState || undefined,
                    pincode: pincode || undefined,
                    country: "India",
                  }
                : undefined,
            notes:
              (notes ? notes + "\n\n" : "") +
              "Submitted via streamlined Partner Signup — our team will contact you for any additional documents required.",
          }),
        });
        const vendorData = await vendorRes.json();
        if (!vendorData.success) {
          setState({
            kind: "vendorFailed",
            message: vendorData.message || "Business application failed to submit.",
            username,
          });
          return;
        }
        setState({ kind: "success", username, requestNumber: vendorData.requestNumber });
      } catch {
        setState({
          kind: "vendorFailed",
          message: "Business application failed to submit. Please try again.",
          username,
        });
      }
    } catch {
      setState({
        kind: "accountFailed",
        message: "Account creation failed. Please try again.",
      });
    }
  }

  const submitting = state.kind === "submitting";

  return (
    <div className={`${neonPageBg} relative overflow-hidden`}>
      <div aria-hidden className={`${neonGlow("violet")} -right-32 -top-32 h-96 w-96`} />
      <div aria-hidden className={`${neonGlow("cyan")} -left-40 top-72 h-80 w-80 opacity-70`} />

      {/* Header */}
      <header className="relative z-10 px-6 py-6">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/">
            <Logo />
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-violet-700 transition-colors hover:text-cyan-600"
          >
            ← Back to Home
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-2xl px-6 pb-20">
        <div className="mb-8 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-violet-500">
            Partner With Us
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
            Become a <span className={neonGradientText}>Partner</span>
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-gray-500">
            Create your account and submit your business application in one
            guided flow.
          </p>
        </div>

        {state.kind === "success" ? (
          <div className={`${neonCard} p-8 text-center`}>
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <h2 className="mt-4 text-lg font-bold text-gray-900">
              You&apos;re almost there!
            </h2>
            <div className="mt-4 space-y-3 text-left text-sm text-gray-600">
              <p>
                <span className="font-semibold text-gray-900">
                  ✅ Your account has been created
                </span>{" "}
                — your User ID is{" "}
                <span className="font-mono font-semibold text-violet-700">
                  {state.username}
                </span>
                . You can log in with this right away.
              </p>
              <p>
                <span className="font-semibold text-gray-900">
                  ✅ Your partner application has been submitted for review
                </span>
                {state.requestNumber ? (
                  <>
                    {" "}
                    — request number{" "}
                    <span className="font-mono font-semibold text-violet-700">
                      {state.requestNumber}
                    </span>
                  </>
                ) : null}
                . Your account exists now, but your vendor/business access is
                still pending admin approval — you&apos;ll receive your
                vendor login and dashboard access once the review is
                complete.
              </p>
            </div>
            <Link href="/login" className={`${neonButtonPrimary} mt-6`}>
              Login to Your Account
              <ArrowRight size={18} />
            </Link>
          </div>
        ) : state.kind === "accountFailed" ? (
          <div className={`${neonCard} p-8 text-center`}>
            <AlertCircle className="mx-auto h-10 w-10 text-red-500" />
            <h2 className="mt-4 text-lg font-bold text-gray-900">
              We couldn&apos;t create your account
            </h2>
            <p className="mt-2 text-sm text-gray-500">{state.message}</p>
            <button
              onClick={() => setState({ kind: "idle" })}
              className={`${neonButtonPrimary} mt-6`}
            >
              Try Again
            </button>
          </div>
        ) : state.kind === "vendorFailed" ? (
          <div className={`${neonCard} p-8 text-center`}>
            <AlertCircle className="mx-auto h-10 w-10 text-amber-500" />
            <h2 className="mt-4 text-lg font-bold text-gray-900">
              Your account was created — but the business application didn&apos;t go through
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Good news: your login <span className="font-mono font-semibold text-violet-700">{state.username}</span> exists
              and works right now. However, we couldn&apos;t submit your
              business application: {state.message}
            </p>
            <p className="mt-2 text-sm text-gray-500">
              Please complete your business application separately using
              your new User ID.
            </p>
            <Link href="/vendor-apply" className={`${neonButtonPrimary} mt-6`}>
              Complete Business Application
              <ArrowRight size={18} />
            </Link>
          </div>
        ) : (
          <>
            {/* Step indicator */}
            <div className="mb-6 flex items-center justify-center gap-3">
              {[1, 2].map((n) => (
                <div key={n} className="flex items-center gap-3">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                      step === n
                        ? "bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-[0_4px_16px_-4px_rgba(139,92,246,0.6)]"
                        : step > n
                        ? "bg-violet-100 text-violet-600"
                        : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {n}
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      step === n ? "text-gray-900" : "text-gray-400"
                    }`}
                  >
                    {n === 1 ? "Account" : "Business Details"}
                  </span>
                  {n === 1 && <div className="h-px w-8 bg-gray-200" />}
                </div>
              ))}
            </div>

            <form onSubmit={handleSubmit} className={`${neonCard} p-6 sm:p-8`}>
              {error && (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4">
                  <Field label="Full Name" required>
                    <input
                      className={neonInputCls}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="John Doe"
                    />
                  </Field>
                  <Field label="Email Address" required>
                    <input
                      type="email"
                      className={neonInputCls}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="john@example.com"
                    />
                  </Field>
                  <Field label="Phone Number">
                    <input
                      type="tel"
                      className={neonInputCls}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                    />
                  </Field>
                  <Field label="Password" required>
                    <PasswordInput value={password} onChange={setPassword} />
                  </Field>
                  <Field label="Confirm Password" required>
                    <PasswordInput
                      value={confirmPassword}
                      onChange={setConfirmPassword}
                      placeholder="Repeat password"
                    />
                  </Field>

                  <button
                    type="button"
                    onClick={goToStep2}
                    className={`${neonButtonPrimary} mt-2 w-full`}
                  >
                    Continue to Business Details
                    <ArrowRight size={18} />
                  </button>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Company Name" required>
                      <input
                        className={neonInputCls}
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="Acme Traders Pvt Ltd"
                      />
                    </Field>
                    <Field label="Contact Person" required>
                      <input
                        className={neonInputCls}
                        value={contactPerson}
                        onChange={(e) => setContactPerson(e.target.value)}
                        placeholder="Full name"
                      />
                    </Field>
                    <Field label="Business Category">
                      <select
                        className={neonInputCls}
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                      >
                        <option value="">Select…</option>
                        {BUSINESS_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-medium text-gray-600">
                      GST Registration<span className="text-pink-500">*</span>
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setGstRegistered(true)}
                        className={`rounded-xl border py-2.5 text-sm font-medium transition-all ${
                          gstRegistered
                            ? "border-transparent bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-[0_4px_16px_-4px_rgba(139,92,246,0.5)]"
                            : "border-violet-100 bg-white text-gray-600 hover:border-violet-300"
                        }`}
                      >
                        With GST
                      </button>
                      <button
                        type="button"
                        onClick={() => setGstRegistered(false)}
                        className={`rounded-xl border py-2.5 text-sm font-medium transition-all ${
                          !gstRegistered
                            ? "border-transparent bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-[0_4px_16px_-4px_rgba(139,92,246,0.5)]"
                            : "border-violet-100 bg-white text-gray-600 hover:border-violet-300"
                        }`}
                      >
                        Without GST
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {gstRegistered && (
                      <Field
                        label="GSTIN"
                        required
                        hint={gstWarning || "15-character GST identification number"}
                      >
                        <input
                          className={neonInputCls}
                          value={gstNumber}
                          onChange={(e) => setGstNumber(e.target.value)}
                          onBlur={handleGstBlur}
                          placeholder="22AAAAA0000A1Z5"
                        />
                      </Field>
                    )}
                    <Field
                      label="PAN"
                      required={!gstRegistered}
                      hint={gstRegistered ? "Optional when GSTIN is provided" : "Required for businesses without GST"}
                    >
                      <input
                        className={neonInputCls}
                        value={panNumber}
                        onChange={(e) => setPanNumber(e.target.value)}
                        placeholder="AAAAA0000A"
                      />
                    </Field>
                  </div>

                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Registered Address
                    </p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field label="Street">
                        <input
                          className={neonInputCls}
                          value={street}
                          onChange={(e) => setStreet(e.target.value)}
                        />
                      </Field>
                      <Field label="State">
                        <StateSelect
                          value={addrState}
                          onChange={(value) => {
                            setAddrState(value);
                            setCity("");
                          }}
                          className={neonInputCls}
                        />
                      </Field>
                      <Field label="City">
                        <CitySelect
                          value={city}
                          state={addrState}
                          onChange={(value) => setCity(value)}
                          className={neonInputCls}
                        />
                      </Field>
                      <Field label="Pincode">
                        <PincodeInput
                          value={pincode}
                          onChange={(value) => setPincode(value)}
                          onResolved={({ state: s, city: c }) => {
                            setAddrState((prev) => prev || s);
                            setCity((prev) => prev || c);
                          }}
                          className={neonInputCls}
                        />
                      </Field>
                    </div>
                  </div>

                  <Field label="Anything else we should know?">
                    <textarea
                      className={`${neonInputCls} min-h-[80px]`}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                    <p className="mt-1 text-[10px] text-gray-400">
                      Our team will contact you for any additional documents
                      required.
                    </p>
                  </Field>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      disabled={submitting}
                      className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-6 py-3 text-sm font-semibold text-violet-700 transition-all hover:border-cyan-300 disabled:opacity-50"
                    >
                      <ArrowLeft size={16} />
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className={`${neonButtonPrimary} flex-1 disabled:opacity-60`}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          Submit Application
                          <ArrowRight size={18} />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </form>

            <p className="mt-6 text-center text-sm text-gray-500">
              Already have an account?{" "}
              <Link href="/vendor-apply" className="font-medium text-violet-700 hover:text-cyan-600">
                Apply as a vendor here
              </Link>{" "}
              or{" "}
              <Link href="/login" className="font-medium text-violet-700 hover:text-cyan-600">
                sign in
              </Link>
            </p>
          </>
        )}
      </main>
    </div>
  );
}
