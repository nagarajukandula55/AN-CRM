"use client";

import Image from "next/image";

/**
 * Real logo mark only (public/logo-mark.png, from the full variant pack
 * in brand-assets/) -- no wordmark text next to it, per explicit
 * direction ("name not required on top"). The mark itself is the
 * bright blue/orange/green gradient icon, readable on any background,
 * so no separate light/dark variant handling is needed here.
 *
 * Public-facing product name is "My Biz Flow" -- AN-CRM is this app's
 * internal/repo name only, never shown to an outside visitor.
 */
export default function Logo({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/logo-mark.png"
      alt="My Biz Flow"
      width={56}
      height={56}
      className={`h-14 w-14 object-contain ${className}`}
      priority
    />
  );
}
