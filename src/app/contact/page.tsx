"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, AlertCircle, Loader2, Mail, Phone, MapPin } from "lucide-react";
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
      <label className={neonLabelCls}>
        {label} {required && <span className="text-pink-500">*</span>}
      </label>
      {children}
    </div>
  );
}

type SubmitState = { kind: "idle" } | { kind: "submitting" } | { kind: "success" } | { kind: "error"; message: string };

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  const submitting = state.kind === "submitting";

  function validate(): string | null {
    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) {
      return "Please fill in all required fields";
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) return "Please enter a valid email address";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      setState({ kind: "error", message: err });
      return;
    }

    setState({ kind: "submitting" });
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          subject: subject.trim(),
          message: message.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        setState({ kind: "error", message: data.message || "Something went wrong. Please try again." });
        return;
      }
      setState({ kind: "success" });
    } catch {
      setState({ kind: "error", message: "Something went wrong. Please try again." });
    }
  }

  function resetForm() {
    setName("");
    setEmail("");
    setPhone("");
    setSubject("");
    setMessage("");
    setState({ kind: "idle" });
  }

  return (
    <div className={`${neonPageBg} relative overflow-hidden`}>
      <div aria-hidden className={`${neonGlow("violet")} -right-32 -top-32 h-96 w-96`} />
      <div aria-hidden className={`${neonGlow("cyan")} -left-40 top-72 h-80 w-80 opacity-70`} />

      <header className="relative z-10 px-6 py-6">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/">
            <Logo />
          </Link>
          <Link href="/" className="text-sm font-medium text-violet-700 transition-colors hover:text-cyan-600">
            ← Back to Home
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-2xl px-6 pb-20">
        <div className="mb-8 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-violet-500">Get In Touch</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
            Contact <span className={neonGradientText}>Us</span>
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-gray-500">
            Questions about AN Group, an existing account, or becoming a partner — send us a
            message and our team will get back to you.
          </p>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className={`${neonCard} flex items-center gap-3 p-4`}>
            <Mail className="h-4 w-4 flex-shrink-0 text-violet-600" />
            <span className="text-xs text-gray-600">hello@angroup.in</span>
          </div>
          <div className={`${neonCard} flex items-center gap-3 p-4`}>
            <Phone className="h-4 w-4 flex-shrink-0 text-violet-600" />
            <span className="text-xs text-gray-600">Mon–Sat, 10am–7pm IST</span>
          </div>
          <div className={`${neonCard} flex items-center gap-3 p-4`}>
            <MapPin className="h-4 w-4 flex-shrink-0 text-violet-600" />
            <span className="text-xs text-gray-600">India</span>
          </div>
        </div>

        {state.kind === "success" ? (
          <div className={`${neonCard} p-8 text-center`}>
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <h2 className="mt-4 text-lg font-bold text-gray-900">Message sent</h2>
            <p className="mt-2 text-sm text-gray-500">
              Thanks for reaching out — our team will get back to you shortly.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button onClick={resetForm} className={neonButtonPrimary}>
                Send Another Message
              </button>
              <Link href="/" className="text-sm font-medium text-violet-700 hover:text-cyan-600">
                Back to Home
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={`${neonCard} p-6 sm:p-8`}>
            {state.kind === "error" && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {state.message}
              </div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Name" required>
                  <input
                    className={neonInputCls}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
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
              </div>

              <Field label="Phone Number">
                <input
                  type="tel"
                  className={neonInputCls}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                />
              </Field>

              <Field label="Subject" required>
                <input
                  className={neonInputCls}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="How can we help?"
                />
              </Field>

              <Field label="Message" required>
                <textarea
                  className={`${neonInputCls} min-h-[140px]`}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us a bit more..."
                />
              </Field>

              <button type="submit" disabled={submitting} className={`${neonButtonPrimary} mt-2 w-full disabled:opacity-60`}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    Send Message
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-gray-500">
          Looking to partner with us instead?{" "}
          <Link href="/register?tab=vendor" className="font-medium text-violet-700 hover:text-cyan-600">
            Become a Partner
          </Link>
        </p>
      </main>
    </div>
  );
}
