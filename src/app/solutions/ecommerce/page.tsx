"use client";

import Link from "next/link";
import {
  Store,
  ShoppingCart,
  CreditCard,
  Truck,
  Layers,
  Users,
  Search,
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
    icon: Store,
    title: "Native Storefront & Catalog Browsing",
    description:
      "A dedicated, public storefront catalog — browse by category, search across products, and view rich product detail pages, all served from a read-only public API kept separate from the internal admin inventory system.",
  },
  {
    icon: ShoppingCart,
    title: "Guest Checkout, No Account Required",
    description:
      "Customers can complete an order with just name, phone and email — no forced signup. Orders are tracked independently of any user account, so the buying flow stays fast and friction-free.",
  },
  {
    icon: CreditCard,
    title: "Integrated Payments",
    description:
      "Checkout is backed by Razorpay integration end to end — order creation, payment verification and signature validation are all handled server-side, so a payment can never be spoofed or double-counted.",
  },
  {
    icon: Search,
    title: "Guest Order Tracking",
    description:
      "Every order gets an unguessable order ID a customer can use to track status after checkout — no login needed to check where an order stands.",
  },
  {
    icon: Layers,
    title: "Product & Variant Catalog Management",
    description:
      "Manage your full product catalog — including size/pack-size variant groups shown as a single product card with a size selector — from one connected admin system, with categories and storefront banners managed the same way.",
  },
  {
    icon: Truck,
    title: "Order & Fulfillment Tracking",
    description:
      "Orders flow straight into the same operational system used for inventory and logistics, so fulfillment status is always in sync with what's actually in stock.",
  },
  {
    icon: Users,
    title: "B2B Wholesale Ordering (Complementary)",
    description:
      "Run a B2B storefront alongside your consumer-facing one — a separate partner portal lets distributors and retailers sign up, browse a wholesale catalog and place bulk orders under their own login.",
  },
];

export default function EcommerceSolutionPage() {
  return (
    <div className={`${neonPageBg} relative overflow-hidden`}>
      <div aria-hidden className={`${neonGlow("violet")} -right-32 -top-32 h-96 w-96`} />
      <div aria-hidden className={`${neonGlow("cyan")} -left-40 top-72 h-80 w-80 opacity-70`} />

      <header className="relative z-10 px-6 py-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/">
            <Logo />
          </Link>
          <Link href="/" className="text-sm font-medium text-violet-700 transition-colors hover:text-cyan-600">
            ← Back to Home
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 px-6 pb-16 pt-8 text-center">
        <div className="mx-auto max-w-3xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-violet-500">
            Retail & E-Commerce
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-gray-900 md:text-5xl">
            A Native Storefront, <span className={neonGradientText}>Built to Sell</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-500">
            AN Group powers a full native e-commerce experience — public catalog browsing, guest
            checkout, integrated payments and order tracking — connected directly to the same
            inventory your team already manages.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/register" className={neonButtonPrimary}>
              Start Selling
              <ArrowRight size={18} />
            </Link>
            <Link href="/contact" className={neonButtonSecondary}>
              Talk to Sales
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
                  <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-50">
                    <Icon size={22} strokeWidth={1.75} className="text-cyan-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-500">{f.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Flow strip */}
      <section className="relative z-10 border-y border-violet-100 bg-white/60 px-6 py-14 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Browse to Delivered — All Connected</h2>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm text-gray-600">
            {["Browse Catalog", "Add to Cart", "Guest Checkout", "Payment Verified", "Order Fulfilled", "Delivered"].map((step, i, arr) => (
              <span key={step} className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200 bg-white px-3 py-1.5 font-medium">
                  <CheckCircle2 size={14} className="text-cyan-600" />
                  {step}
                </span>
                {i < arr.length - 1 && <ArrowRight size={14} className="text-gray-300" />}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 px-6 py-24">
        <div className="mx-auto max-w-3xl overflow-hidden rounded-[28px] bg-gradient-to-br from-cyan-500 via-violet-500 to-violet-600 px-8 py-14 text-center text-white shadow-[0_20px_60px_-15px_rgba(6,182,212,0.5)]">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Ready to sell on your own native storefront?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-white/85">
            Create your account to get started, or talk to our team about what selling on AN Group
            looks like for your business.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-semibold text-violet-700 shadow-sm transition-transform hover:-translate-y-0.5"
            >
              Start Selling
              <ArrowRight size={18} />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 rounded-full border border-white/40 px-7 py-3.5 text-base font-semibold text-white transition-colors hover:bg-white/10"
            >
              Talk to Sales
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
