"use client";

import Image from "next/image";

/**
 * Real logo mark (public/logo-mark.png, from the full variant pack in
 * brand-assets/) + CSS-colored wordmark text -- not the horizontal
 * lockup PNG, deliberately: that file's wordmark is baked-in dark navy,
 * unreadable against this app's dark "MBF Neon" marketing pages
 * (bg-[#05060d]) where every current caller of this component lives.
 * Pairing the mark (readable on any background -- it's a bright
 * blue/orange/green gradient, not dark text) with real text lets the
 * existing `className` override (e.g. pricing page's "!text-white")
 * keep working exactly as before.
 *
 * Public-facing product name is "My Biz Flow" -- AN-CRM is this app's
 * internal/repo name only, never shown to an outside visitor.
 */
export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-[var(--text)] ${className}`}>
      <Image src="/logo-mark.png" alt="" width={28} height={28} className="h-7 w-7 object-contain" priority />
      <span className="text-xl font-bold tracking-tight">
        My Biz Flow
      </span>
    </span>
  );
}
