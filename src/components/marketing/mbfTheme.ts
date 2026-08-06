/**
 * "MBF Neon" -- My Biz Flow's own dark, saturated neon theme, distinct
 * from ANgroup's light-pastel "Light Neon" (./theme.ts, still shared with
 * that site) per explicit direction ("this colour scheme we already built
 * for AN Group but this should be more neon style and more modern").
 * Deep near-black base with genuinely glowing cyan/magenta/lime accents --
 * closer to an actual neon sign than a soft SaaS gradient. Scoped the same
 * way theme.ts is: PUBLIC marketing surface only (homepage, partner-
 * signup) -- never imported into console/vendor, which keep their own
 * design-system tokens per CLAUDE.md.
 */

export const mbfColors = {
  cyan: "#00e5ff",
  cyanDeep: "#00b8d4",
  magenta: "#ff2bd6",
  magentaDeep: "#d600b0",
  lime: "#c6ff00",
};

/** Page background -- deep near-black with a subtle blue-violet tint, not flat black. */
export const mbfPageBg = "min-h-screen bg-[#05060d] text-gray-100";

/** Ambient glowing blob -- bigger blur + higher opacity than the light theme's, so it actually reads as "glowing" against a dark base. */
export function mbfGlow(color: "cyan" | "magenta" | "lime" = "cyan") {
  const map: Record<string, string> = {
    cyan: "bg-cyan-400/25",
    magenta: "bg-fuchsia-500/25",
    lime: "bg-lime-400/20",
  };
  return `pointer-events-none absolute rounded-full blur-[120px] ${map[color]}`;
}

/** Primary CTA -- solid neon gradient with a real glow shadow, not just a tint. */
export const mbfButtonPrimary =
  "inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-base font-semibold text-[#05060d] " +
  "bg-gradient-to-r from-cyan-400 via-cyan-300 to-fuchsia-400 " +
  "shadow-[0_0_24px_-2px_rgba(0,229,255,0.6),0_0_48px_-8px_rgba(255,43,214,0.4)] " +
  "transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_32px_0px_rgba(0,229,255,0.8),0_0_64px_-4px_rgba(255,43,214,0.55)] " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#05060d]";

/** Secondary / outline CTA -- glass surface, neon border, glows on hover. */
export const mbfButtonSecondary =
  "inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-base font-semibold text-gray-100 " +
  "border border-cyan-400/40 bg-white/5 backdrop-blur-sm " +
  "transition-all duration-300 hover:-translate-y-0.5 hover:border-fuchsia-400/60 hover:shadow-[0_0_24px_-6px_rgba(255,43,214,0.5)]";

/** Nav pill CTA. */
export const mbfButtonNav =
  "inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-[#05060d] " +
  "bg-gradient-to-r from-cyan-400 to-fuchsia-400 shadow-[0_0_16px_-2px_rgba(0,229,255,0.6)] " +
  "transition-all duration-300 hover:shadow-[0_0_24px_0px_rgba(0,229,255,0.8)]";

/** Ghost nav pill. */
export const mbfButtonGhostNav =
  "inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-gray-200 " +
  "border border-cyan-400/30 bg-white/5 backdrop-blur-sm " +
  "transition-all duration-300 hover:border-cyan-300/60 hover:text-cyan-300";

/** Gradient text -- true neon-sign multi-color sweep. */
export const mbfGradientText =
  "bg-gradient-to-r from-cyan-300 via-fuchsia-400 to-lime-300 bg-clip-text text-transparent";

/** Glass card on the dark base, neon hairline border that intensifies on hover. */
export const mbfCard =
  "rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm shadow-[0_0_0_1px_rgba(255,255,255,0.02)] " +
  "transition-all duration-300 hover:border-cyan-400/40 hover:shadow-[0_0_32px_-12px_rgba(0,229,255,0.4)]";
