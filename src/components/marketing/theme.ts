/**
 * "Light Neon" theme — shared visual language for the PUBLIC marketing
 * surface only (HomePage, /partner-signup, and touch-ups on
 * /appointment-request). Never imported by anything under src/app/admin
 * or src/app/vendor — those keep the app's original near-black minimal
 * theme defined in globals.css untouched.
 *
 * Palette: light/white base with vivid "electric" accents —
 *   violet  #8b5cf6 / #7c3aed
 *   cyan    #06b6d4 / #22d3ee
 *   pink    #ec4899 (sparingly, for highlight accents)
 * Used as gradients + soft colored glows on a clean white/off-white
 * background — corporate-modern (Linear/Vercel/Stripe-adjacent), not
 * high-contrast cyberpunk.
 */

export const neonColors = {
  violet: "#8b5cf6",
  violetDark: "#7c3aed",
  cyan: "#06b6d4",
  cyanLight: "#22d3ee",
  pink: "#ec4899",
};

/** Primary gradient CTA button (solid neon gradient, white text). */
export const neonButtonPrimary =
  "inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-base font-semibold text-white " +
  "bg-gradient-to-r from-violet-600 via-violet-500 to-cyan-500 " +
  "shadow-[0_8px_30px_-8px_rgba(139,92,246,0.55)] " +
  "transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_40px_-6px_rgba(139,92,246,0.65)] " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2";

/** Secondary / outline CTA — light surface, neon border + text, subtle glow on hover. */
export const neonButtonSecondary =
  "inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-base font-semibold " +
  "border border-violet-200 bg-white text-violet-700 " +
  "transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-[0_8px_30px_-10px_rgba(6,182,212,0.5)]";

/** Smaller pill CTA — used in nav bars. */
export const neonButtonNav =
  "inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-white " +
  "bg-gradient-to-r from-violet-600 to-cyan-500 shadow-[0_4px_16px_-4px_rgba(139,92,246,0.5)] " +
  "transition-all duration-300 hover:shadow-[0_6px_24px_-4px_rgba(139,92,246,0.6)]";

/** Ghost nav link (outline pill), used for secondary nav CTAs like "Book an Appointment". */
export const neonButtonGhostNav =
  "inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold " +
  "border border-violet-200 text-violet-700 bg-white/60 backdrop-blur-sm " +
  "transition-all duration-300 hover:border-cyan-300 hover:text-cyan-700 hover:bg-white";

/** Gradient text treatment for headline highlight words. */
export const neonGradientText =
  "bg-gradient-to-r from-violet-600 via-fuchsia-500 to-cyan-500 bg-clip-text text-transparent";

/** Soft card surface with a hairline neon-tinted border + hover glow. */
export const neonCard =
  "rounded-2xl border border-violet-100 bg-white/80 backdrop-blur-sm shadow-[0_2px_20px_-8px_rgba(139,92,246,0.15)] " +
  "transition-all duration-300 hover:shadow-[0_8px_32px_-8px_rgba(139,92,246,0.3)] hover:border-violet-200";

/** Background wrapper for public pages — light base + faint ambient glow blobs (blobs rendered separately). */
export const neonPageBg = "min-h-screen bg-gradient-to-b from-white via-violet-50/40 to-cyan-50/30 text-gray-900";

/** Ambient decorative glow blob className generator. */
export function neonGlow(color: "violet" | "cyan" | "pink" = "violet") {
  const map: Record<string, string> = {
    violet: "bg-violet-300/30",
    cyan: "bg-cyan-300/30",
    pink: "bg-pink-300/25",
  };
  return `pointer-events-none absolute rounded-full blur-[100px] ${map[color]}`;
}

/** Input styling shared across marketing forms (partner-signup). */
export const neonInputCls =
  "w-full bg-white border border-violet-100 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 " +
  "outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all";

export const neonLabelCls = "block text-xs font-medium text-gray-600 mb-1.5";
