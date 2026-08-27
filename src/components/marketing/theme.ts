/**
 * "Light Neon" theme — shared visual language for the PUBLIC marketing
 * surface only (partner-signup, contact, solutions/crm). Never imported
 * by anything under src/app/console or src/app/vendor — those keep the
 * app's original near-black minimal theme defined in globals.css
 * untouched.
 *
 * Palette: light/white base with vivid accents pulled from the real My
 * Biz Flow logo (brand-assets/) --
 *   blue    #2563eb / #1d4ed8
 *   green   #16a34a / #22c55e
 *   orange  #f97316 (sparingly, for highlight accents)
 * Used as gradients + soft colored glows on a clean white/off-white
 * background — corporate-modern (Linear/Vercel/Stripe-adjacent), not
 * high-contrast cyberpunk.
 */

export const neonColors = {
  blue: "#2563eb",
  blueDark: "#1d4ed8",
  green: "#16a34a",
  greenLight: "#22c55e",
  orange: "#f97316",
};

/** Primary gradient CTA button (solid neon gradient, white text). */
export const neonButtonPrimary =
  "inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-base font-semibold text-white " +
  "bg-gradient-to-r from-blue-600 via-blue-500 to-green-500 " +
  "shadow-[0_8px_30px_-8px_rgba(37,99,235,0.55)] " +
  "transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_40px_-6px_rgba(37,99,235,0.65)] " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2";

/** Secondary / outline CTA — light surface, neon border + text, subtle glow on hover. */
export const neonButtonSecondary =
  "inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-base font-semibold " +
  "border border-blue-200 bg-white text-blue-700 " +
  "transition-all duration-300 hover:-translate-y-0.5 hover:border-green-300 hover:shadow-[0_8px_30px_-10px_rgba(22,163,74,0.5)]";

/** Smaller pill CTA — used in nav bars. */
export const neonButtonNav =
  "inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-white " +
  "bg-gradient-to-r from-blue-600 to-green-500 shadow-[0_4px_16px_-4px_rgba(37,99,235,0.5)] " +
  "transition-all duration-300 hover:shadow-[0_6px_24px_-4px_rgba(37,99,235,0.6)]";

/** Ghost nav link (outline pill), used for secondary nav CTAs like "Book an Appointment". */
export const neonButtonGhostNav =
  "inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold " +
  "border border-blue-200 text-blue-700 bg-white/60 backdrop-blur-sm " +
  "transition-all duration-300 hover:border-green-300 hover:text-green-700 hover:bg-white";

/** Gradient text treatment for headline highlight words. */
export const neonGradientText =
  "bg-gradient-to-r from-blue-600 via-orange-500 to-green-500 bg-clip-text text-transparent";

/** Soft card surface with a hairline neon-tinted border + hover glow. */
export const neonCard =
  "rounded-2xl border border-blue-100 bg-white/80 backdrop-blur-sm shadow-[0_2px_20px_-8px_rgba(37,99,235,0.15)] " +
  "transition-all duration-300 hover:shadow-[0_8px_32px_-8px_rgba(37,99,235,0.3)] hover:border-blue-200";

/** Background wrapper for public pages — light base + faint ambient glow blobs (blobs rendered separately). */
export const neonPageBg = "min-h-screen bg-gradient-to-b from-white via-blue-50/40 to-green-50/30 text-gray-900";

/** Ambient decorative glow blob className generator. */
export function neonGlow(color: "blue" | "green" | "orange" = "blue") {
  const map: Record<string, string> = {
    blue: "bg-blue-300/30",
    green: "bg-green-300/30",
    orange: "bg-orange-300/25",
  };
  return `pointer-events-none absolute rounded-full blur-[100px] ${map[color]}`;
}

/** Input styling shared across marketing forms (partner-signup). */
export const neonInputCls =
  "w-full bg-white border border-blue-100 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 " +
  "outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all";

export const neonLabelCls = "block text-xs font-medium text-gray-600 mb-1.5";
