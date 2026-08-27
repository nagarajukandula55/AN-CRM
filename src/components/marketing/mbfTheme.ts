/**
 * "MBF Neon" -- My Biz Flow's own dark, saturated neon theme, distinct
 * from ANgroup's light-pastel "Light Neon" (./theme.ts, still shared with
 * that site). Deep near-black base with genuinely glowing blue/orange/
 * green accents -- pulled directly from the real My Biz Flow logo
 * (brand-assets/) once it existed, replacing the earlier cyan/magenta/
 * lime placeholder palette chosen before a real logo was available.
 * Scoped the same way theme.ts is: PUBLIC marketing surface only
 * (pricing page) -- never imported into console/vendor, which keep their
 * own design-system tokens per CLAUDE.md.
 */

export const mbfColors = {
  blue: "#38bdf8",
  blueDeep: "#0ea5e9",
  orange: "#fb923c",
  orangeDeep: "#f97316",
  green: "#4ade80",
};

/** Page background -- deep near-black with a subtle blue-violet tint, not flat black. */
export const mbfPageBg = "min-h-screen bg-[#05060d] text-gray-100";

/** Ambient glowing blob -- bigger blur + higher opacity than the light theme's, so it actually reads as "glowing" against a dark base. */
export function mbfGlow(color: "blue" | "orange" | "green" = "blue") {
  const map: Record<string, string> = {
    blue: "bg-sky-400/25",
    orange: "bg-orange-500/25",
    green: "bg-green-400/20",
  };
  return `pointer-events-none absolute rounded-full blur-[120px] ${map[color]}`;
}

/** Primary CTA -- solid neon gradient with a real glow shadow, not just a tint. */
export const mbfButtonPrimary =
  "inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-base font-semibold text-[#05060d] " +
  "bg-gradient-to-r from-sky-400 via-sky-300 to-orange-400 " +
  "shadow-[0_0_24px_-2px_rgba(56,189,248,0.6),0_0_48px_-8px_rgba(251,146,60,0.4)] " +
  "transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_32px_0px_rgba(56,189,248,0.8),0_0_64px_-4px_rgba(251,146,60,0.55)] " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#05060d]";

/** Secondary / outline CTA -- glass surface, neon border, glows on hover. */
export const mbfButtonSecondary =
  "inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-base font-semibold text-gray-100 " +
  "border border-sky-400/40 bg-white/5 backdrop-blur-sm " +
  "transition-all duration-300 hover:-translate-y-0.5 hover:border-orange-400/60 hover:shadow-[0_0_24px_-6px_rgba(251,146,60,0.5)]";

/** Nav pill CTA. */
export const mbfButtonNav =
  "inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-[#05060d] " +
  "bg-gradient-to-r from-sky-400 to-orange-400 shadow-[0_0_16px_-2px_rgba(56,189,248,0.6)] " +
  "transition-all duration-300 hover:shadow-[0_0_24px_0px_rgba(56,189,248,0.8)]";

/** Ghost nav pill. */
export const mbfButtonGhostNav =
  "inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-gray-200 " +
  "border border-sky-400/30 bg-white/5 backdrop-blur-sm " +
  "transition-all duration-300 hover:border-sky-300/60 hover:text-sky-300";

/** Gradient text -- true neon-sign multi-color sweep. */
export const mbfGradientText =
  "bg-gradient-to-r from-sky-300 via-orange-400 to-green-300 bg-clip-text text-transparent";

/** Glass card on the dark base, neon hairline border that intensifies on hover. */
export const mbfCard =
  "rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm shadow-[0_0_0_1px_rgba(255,255,255,0.02)] " +
  "transition-all duration-300 hover:border-sky-400/40 hover:shadow-[0_0_32px_-12px_rgba(56,189,248,0.4)]";
