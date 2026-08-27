"use client";

import Link from "next/link";
import {
  Wrench,
  Calendar,
  ClipboardList,
  Users,
  Package,
  Smartphone,
  Receipt,
  MessageSquare,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import Logo from "@/components/marketing/Logo";
import {
  neonButtonPrimary,
  neonButtonSecondary,
  neonPageBg,
  neonGlow,
  neonGradientText,
  neonCard,
} from "@/components/marketing/theme";

const FEATURES = [
  {
    icon: Calendar,
    title: "Appointment Booking & Lead Capture",
    description:
      "Customers can request an on-site or service-center appointment straight from your storefront — no login required. Every request lands as a new lead in the CRM call queue, ready for your team to qualify and action.",
  },
  {
    icon: ClipboardList,
    title: "Call-to-Job Lifecycle Tracking",
    description:
      "Every call moves through a clear pipeline — New, Contacted, Qualified, Job Created, In Progress, Closed Won/Lost — so nothing sits untouched and every lead has a visible status.",
  },
  {
    icon: Wrench,
    title: "Job Sheets & Repair Workorders",
    description:
      "Convert a qualified call into a full job sheet with line items, technician assignment, and a milestone tracker — Created, Repair Started, In Progress, Completed, Closed — so both your team and the customer always know where the repair stands.",
  },
  {
    icon: Smartphone,
    title: "Brand / Model / Variant-Aware Catalog",
    description:
      "A structured Brand → Series → Device Model → Variant catalog keeps every job sheet tied to the exact device being serviced. Missing a model? Staff can request it be added, routed to admin for approval — the catalog only grows with vetted entries.",
  },
  {
    icon: Users,
    title: "Technician & Engineer Assignment",
    description:
      "Assign jobs to the right engineer, track repair progress in real time, and hand off completed work for closure — with fault/symptom codes and standard solutions linked to every diagnosis for consistent, auditable repairs.",
  },
  {
    icon: Package,
    title: "Service Center Parts & BOM Management",
    description:
      "Pick parts and materials for a job straight from your Service Center's Bill of Materials, complete with HSN codes — so every job sheet is ready to convert into a GST-ready invoice the moment the repair is complete.",
  },
  {
    icon: Receipt,
    title: "GST-Ready Invoicing",
    description:
      "Closing a job sheet generates an invoice directly from its line items — tax rates, HSN codes and totals carried through automatically, so there's no manual re-entry between the repair record and the bill.",
  },
  {
    icon: MessageSquare,
    title: "Customer Communication & Status Visibility",
    description:
      "Keep customers informed from first call to final handover, with a clean audit trail of every status change, note and communication tied to the job.",
  },
];

export default function CrmSolutionPage() {
  return (
    <div className={`${neonPageBg} relative overflow-hidden`}>
      <div aria-hidden className={`${neonGlow("blue")} -right-32 -top-32 h-96 w-96`} />
      <div aria-hidden className={`${neonGlow("green")} -left-40 top-72 h-80 w-80 opacity-70`} />

      <header className="relative z-10 px-6 py-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/">
            <Logo />
          </Link>
          <Link href="/" className="text-sm font-medium text-blue-700 transition-colors hover:text-green-600">
            ← Back to Home
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 px-6 pb-16 pt-8 text-center">
        <div className="mx-auto max-w-3xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-blue-500">
            Repair & Service Centers
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-ink md:text-5xl">
            CRM & Repair Service, <span className={neonGradientText}>Built End to End</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-3">
            From the first appointment request to a closed, invoiced job — AN Group's CRM & Repair
            Service module runs your service business on one connected system, with a
            brand/model-aware catalog, technician workflows and GST-ready invoicing built in.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/appointment-request" className={neonButtonPrimary}>
              Book a Service
              <ArrowRight size={18} />
            </Link>
            <Link href="/partner-signup" className={neonButtonSecondary}>
              Run This For Your Own Business
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 px-6 pb-24">
        <div className="mx-auto max-w-5xl">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className={`${neonCard} p-7`}>
                  <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-card bg-blue-50">
                    <Icon size={22} strokeWidth={1.75} className="text-blue-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-ink">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-3">{f.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Lifecycle strip */}
      <section className="relative z-10 border-y border-blue-100 bg-surface/60 px-6 py-14 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-ink">Lead to Closed Job — All in One Flow</h2>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm text-ink-2">
            {["Lead Captured", "Qualified", "Job Sheet Created", "Technician Assigned", "Repair Completed", "Invoiced & Closed"].map((step, i, arr) => (
              <span key={step} className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-surface px-3 py-1.5 font-medium">
                  <CheckCircle2 size={14} className="text-blue-600" />
                  {step}
                </span>
                {i < arr.length - 1 && <ArrowRight size={14} className="text-ink-3" />}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 px-6 py-24">
        <div className="mx-auto max-w-3xl overflow-hidden rounded-[28px] bg-gradient-to-br from-blue-600 via-blue-500 to-green-500 px-8 py-14 text-center text-white shadow-[0_20px_60px_-15px_rgba(139,92,246,0.5)]">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Ready to run your service business on AN Group?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-white/85">
            Book a service directly, or bring your own repair/service center onto the platform as a
            partner.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/appointment-request"
              className="inline-flex items-center gap-2 rounded-full bg-surface px-7 py-3.5 text-base font-semibold text-blue-700 shadow-sm transition-transform hover:-translate-y-0.5"
            >
              Book a Service
              <ArrowRight size={18} />
            </Link>
            <Link
              href="/partner-signup"
              className="inline-flex items-center gap-2 rounded-full border border-white/40 px-7 py-3.5 text-base font-semibold text-white transition-colors hover:bg-surface/10"
            >
              Run This For Your Own Business
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
