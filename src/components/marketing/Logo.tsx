"use client";

import Image from "next/image";

/**
 * Full logo lockup -- icon + "My Biz Flow" wordmark + tagline, per
 * explicit direction to show the complete logo, not just the icon mark.
 *
 * public/logo-full.png is a tight crop of the master artwork
 * (brand-assets/01_master_transparent_2048x2048.png) -- the file itself
 * has a huge transparent margin around the actual art, which is what
 * made every earlier attempt at "just resize it" still read as a tiny
 * speck. The wordmark/tagline text is a dark navy that's also illegible
 * on this app's near-black marketing background (#05060d in
 * mbfTheme.ts). Rather than reworking the whole page theme, the logo
 * carries its own small light pill backdrop so the real, full-color
 * artwork (navy text included) stays legible no matter what page
 * background it sits on.
 *
 * Public-facing product name is "My Biz Flow" -- AN-CRM is this app's
 * internal/repo name only, never shown to an outside visitor.
 */
export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span className="inline-flex items-center rounded-xl bg-white/95 px-3 py-2 shadow-sm">
      <Image
        src="/logo-full.png"
        alt="My Biz Flow"
        width={1968}
        height={1096}
        className={`h-12 sm:h-14 w-auto object-contain ${className}`}
        priority
      />
    </span>
  );
}
