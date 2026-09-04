"use client";

import Image from "next/image";

/**
 * Real logo mark only -- no wordmark text next to it, per explicit
 * direction ("name not required on top"). The mark itself is the
 * bright blue/orange/green gradient icon, readable on any background,
 * so no separate light/dark variant handling is needed here.
 *
 * public/logo-icon.png is a cropped-tight version of the master mark
 * (brand-assets/01_master_transparent_2048x2048.png): the original
 * logo-mark.png/logo-horizontal.png files are the FULL lockup (icon +
 * "My Biz Flow" wordmark + tagline) on a square canvas with a lot of
 * transparent padding around the icon -- squeezing that whole square
 * into a small nav-bar box via object-contain shrank the actual icon
 * down to near-illegible size ("logo hardly visible"). logo-icon.png
 * is trimmed to just the icon glyph (~512x224, no padding), so a nav
 * logo actually reads as a mark, not a speck.
 *
 * Public-facing product name is "My Biz Flow" -- AN-CRM is this app's
 * internal/repo name only, never shown to an outside visitor.
 */
export default function Logo({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/logo-icon.png"
      alt="My Biz Flow"
      width={512}
      height={224}
      className={`h-10 sm:h-12 w-auto object-contain ${className}`}
      priority
    />
  );
}
