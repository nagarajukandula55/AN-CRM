"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ShoppingBag,
  Wrench,
  Warehouse,
  Palette,
  Factory,
  ArrowRight,
  Menu,
  X,
} from "lucide-react";
import Logo from "./Logo";
import {
  neonButtonNav,
  neonButtonGhostNav,
  neonButtonPrimary,
  neonButtonSecondary,
  neonGradientText,
  neonGlow,
} from "./theme";

/* -------------------------------------------------------------------- */
/* Data                                                                  */
/* -------------------------------------------------------------------- */

const VERTICALS = [
  {
    icon: ShoppingBag,
    title: "Retail & E-Commerce",
    description:
      "A native storefront and marketplace experience for brands that want to sell directly to customers online.",
    href: "/solutions/ecommerce",
  },
  {
    icon: Wrench,
    title: "Repair & Service Centers",
    description:
      "End-to-end job-sheet, appointment and CRM tooling for service-driven businesses managing repairs at scale.",
    href: "/solutions/crm",
  },
  {
    icon: Warehouse,
    title: "B2B Wholesale & Distribution",
    description:
      "A dedicated partner portal for distributors and retailers to browse catalogs, place orders and track fulfillment.",
  },
  {
    icon: Palette,
    title: "Design & Branding Studio",
    description:
      "Creative and brand-identity services for businesses that need professional design without an in-house team.",
  },
  {
    icon: Factory,
    title: "Manufacturing & Warehouse",
    description:
      "Inventory, production and warehouse management modules built for businesses that make and move physical goods.",
  },
];

// Placeholder figures — replace with real, verified numbers before launch.
const STATS = [
  { value: "5+", label: "Business Verticals" },
  { value: "100+", label: "Businesses Powered" },
  { value: "1,000+", label: "Products Managed" },
  { value: "24/7", label: "Platform Availability" },
];

const NAV_LINKS = [
  { href: "#verticals", label: "Business Verticals" },
  { href: "#about", label: "About" },
  { href: "/contact", label: "Contact" },
];

const NAV_BOOK_APPOINTMENT = "/appointment-request";
// /register?tab=vendor pre-selects the vendor tab, which itself links on to
// /partner-signup (the real guided flow) -- kept as /register per explicit
// direction rather than sending this CTA straight to /partner-signup.
const NAV_PARTNER_SIGNUP = "/register?tab=vendor";

/* -------------------------------------------------------------------- */
/* Motion helpers                                                        */
/* -------------------------------------------------------------------- */

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

/* -------------------------------------------------------------------- */
/* Component                                                             */
/* -------------------------------------------------------------------- */

export default function HomePage() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* ---------------------------------------------------------- Nav */}
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-[var(--surface)]/90 backdrop-blur-md shadow-[var(--shadow)] border-b border-[var(--border)]"
            : "bg-transparent"
        }`}
      >
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <Logo />

          <nav className="hidden items-center gap-8 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-[var(--text-2)] transition-colors hover:text-[var(--text)]"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <Link href={NAV_BOOK_APPOINTMENT} className={neonButtonGhostNav}>
              Book an Appointment
            </Link>
            <Link href={NAV_PARTNER_SIGNUP} className={neonButtonGhostNav}>
              Become a Partner
            </Link>
            <Link href="/login" className={neonButtonNav}>
              Login
            </Link>
          </div>

          <button
            className="md:hidden"
            aria-label="Toggle menu"
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {mobileOpen && (
          <div className="border-t border-[var(--border)] bg-[var(--surface)] px-6 py-4 md:hidden">
            <nav className="flex flex-col gap-4">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="text-sm font-medium text-[var(--text-2)]"
                >
                  {link.label}
                </a>
              ))}
              <Link href={NAV_BOOK_APPOINTMENT} className={neonButtonGhostNav}>
                Book an Appointment
              </Link>
              <Link href={NAV_PARTNER_SIGNUP} className={neonButtonGhostNav}>
                Become a Partner
              </Link>
              <Link href="/login" className={neonButtonNav}>
                Login
              </Link>
            </nav>
          </div>
        )}
      </header>

      {/* --------------------------------------------------------- Hero */}
      <section className="relative overflow-hidden px-6 pb-24 pt-20 md:pt-28">
        {/* Subtle ambient shapes for dynamism */}
        <motion.div
          aria-hidden
          className={`${neonGlow("violet")} -right-32 -top-32 h-96 w-96`}
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className={`${neonGlow("cyan")} -left-40 top-40 h-72 w-72 opacity-70`}
          animate={{ scale: [1, 1.12, 1] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />

        <div className="container relative mx-auto max-w-4xl text-center">
          <motion.h1
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            transition={{ duration: 0.6 }}
            className="text-4xl font-bold leading-tight tracking-tight md:text-6xl"
          >
            Powering Every Business
            <br className="hidden md:block" /> Under{" "}
            <span className={neonGradientText}>One Group</span>
          </motion.h1>

          <motion.p
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="mx-auto mt-6 max-w-2xl text-lg text-[var(--text-2)]"
          >
            AN Group is a unified enterprise platform bringing retail,
            service, wholesale, design and manufacturing businesses together
            under one operating system — built for scale, designed for
            simplicity.
          </motion.p>

          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <Link href="/login" className={neonButtonPrimary}>
              Get Started
              <ArrowRight size={18} />
            </Link>
            <a href="#verticals" className={neonButtonSecondary}>
              Explore Our Businesses
            </a>
          </motion.div>

          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-6 flex flex-col items-center justify-center gap-3 text-sm sm:flex-row"
          >
            <Link
              href={NAV_BOOK_APPOINTMENT}
              className="font-medium text-violet-700 underline decoration-violet-300 decoration-2 underline-offset-4 transition-colors hover:text-cyan-600"
            >
              Book an Appointment →
            </Link>
            <span className="hidden text-[var(--text-3)] sm:inline">·</span>
            <Link
              href={NAV_PARTNER_SIGNUP}
              className="font-medium text-violet-700 underline decoration-violet-300 decoration-2 underline-offset-4 transition-colors hover:text-cyan-600"
            >
              Become a Partner →
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ------------------------------------------------ What We Do */}
      <section id="verticals" className="px-6 py-24">
        <div className="container mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={fadeUp}
            transition={{ duration: 0.5 }}
            className="mx-auto max-w-2xl text-center"
          >
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              What We Do
            </h2>
            <p className="mt-4 text-[var(--text-2)]">
              A single platform, built to run every kind of business AN
              Group operates — each vertical powered by purpose-built
              tools.
            </p>
          </motion.div>

          <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {VERTICALS.map((v, i) => {
              const Icon = v.icon;
              const cardInner = (
                <>
                  <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--surface-3)]">
                    <Icon size={22} strokeWidth={1.75} />
                  </div>
                  <h3 className="text-lg font-semibold">{v.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--text-2)]">
                    {v.description}
                  </p>
                  {v.href && (
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-violet-700">
                      Learn more <ArrowRight size={14} />
                    </span>
                  )}
                </>
              );
              return (
                <motion.div
                  key={v.title}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, amount: 0.3 }}
                  variants={fadeUp}
                  transition={{ duration: 0.5, delay: (i % 3) * 0.1 }}
                  className={v.href ? "" : "card p-7 transition-shadow hover:shadow-[var(--shadow-lg)]"}
                >
                  {v.href ? (
                    <Link
                      href={v.href}
                      className="card block p-7 transition-shadow hover:shadow-[var(--shadow-lg)]"
                    >
                      {cardInner}
                    </Link>
                  ) : (
                    cardInner
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- Stats */}
      <section id="about" className="border-y border-[var(--border)] bg-[var(--surface)] px-6 py-16">
        <div className="container mx-auto grid grid-cols-2 gap-8 md:grid-cols-4">
          {STATS.map((s, i) => (
            <motion.div
              key={s.label}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.4 }}
              variants={fadeUp}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="text-center"
            >
              {/* Placeholder figure — replace with a real, verified number. */}
              <div className="text-3xl font-bold tracking-tight md:text-4xl">
                {s.value}
              </div>
              <div className="mt-2 text-sm text-[var(--text-3)]">
                {s.label}
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------ CTA */}
      <section className="px-6 py-24">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.4 }}
          variants={fadeUp}
          transition={{ duration: 0.5 }}
          className="container relative mx-auto max-w-3xl overflow-hidden rounded-[28px] bg-gradient-to-br from-violet-600 via-violet-500 to-cyan-500 px-8 py-14 text-center text-white shadow-[0_20px_60px_-15px_rgba(139,92,246,0.5)]"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-[80px]"
          />
          <h2 className="relative text-3xl font-bold tracking-tight md:text-4xl">
            Ready to bring your business onto AN Group?
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-white/85">
            Sign in to manage your business, book an appointment, or apply
            to become a partner — AN Group can support what you build next.
          </p>
          <div className="relative mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-semibold text-violet-700 shadow-sm transition-transform hover:-translate-y-0.5"
            >
              Login to Your Account
              <ArrowRight size={18} />
            </Link>
            <Link
              href={NAV_PARTNER_SIGNUP}
              className="inline-flex items-center gap-2 rounded-full border border-white/40 px-7 py-3.5 text-base font-semibold text-white transition-colors hover:bg-white/10"
            >
              Become a Partner
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 px-7 py-3.5 text-base font-semibold text-white transition-colors hover:bg-white/10"
            >
              Contact Us
            </Link>
          </div>
        </motion.div>
      </section>

      {/* --------------------------------------------------- Footer */}
      <footer id="contact" className="border-t border-[var(--border)] px-6 py-14">
        <div className="container mx-auto grid grid-cols-1 gap-10 md:grid-cols-4">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-sm text-[var(--text-2)]">
              A unified enterprise platform powering every business under
              the AN Group umbrella.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-[var(--text)]">
              Company
            </h4>
            <ul className="mt-4 space-y-2 text-sm text-[var(--text-2)]">
              <li><a href="#about" className="hover:text-[var(--text)]">About</a></li>
              <li><a href="#verticals" className="hover:text-[var(--text)]">Business Verticals</a></li>
              <li><Link href={NAV_PARTNER_SIGNUP} className="font-medium text-violet-600 hover:text-cyan-600">Become a Partner</Link></li>
              <li><Link href={NAV_BOOK_APPOINTMENT} className="hover:text-[var(--text)]">Book an Appointment</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-[var(--text)]">
              Legal
            </h4>
            <ul className="mt-4 space-y-2 text-sm text-[var(--text-2)]">
              <li><a href="#" className="hover:text-[var(--text)]">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-[var(--text)]">Terms of Service</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-[var(--text)]">
              Contact
            </h4>
            <ul className="mt-4 space-y-2 text-sm text-[var(--text-2)]">
              <li>hello@angroup.in</li>
              <li>
                <Link href="/login" className="hover:text-[var(--text)]">
                  Login
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="container mx-auto mt-12 border-t border-[var(--border)] pt-6 text-center text-xs text-[var(--text-3)]">
          &copy; {year} AN Group. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
