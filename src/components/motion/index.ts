/**
 * Swappable animation adapter -- every animated primitive the app uses
 * (fade/slide-in, page transitions, staggered lists, loading pulses) goes
 * through THIS file, not a direct `framer-motion` import scattered across
 * components. Swapping the underlying library later (animejs, motion.dev,
 * GSAP) means rewriting the handful of exports below, not hunting down
 * every call site.
 *
 * Currently backed by framer-motion (already a dependency, used on the
 * public marketing homepage) -- re-exported here under app-neutral names.
 */
export { motion, AnimatePresence } from 'framer-motion'
export type { Variants, Transition } from 'framer-motion'

/** Standard fade+rise-in, used for cards/panels appearing after a data load. */
export const fadeInUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.2, ease: 'easeOut' },
} as const

/** Plain fade, for content swaps where a vertical shift would feel busy. */
export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.15 },
} as const

/** Stagger wrapper for list items -- pass to a parent `motion.div`, then
 * give each child `variants={fadeInUp}` (no separate initial/animate
 * needed on children when the parent declares the stagger). */
export const staggerChildren = {
  animate: { transition: { staggerChildren: 0.04 } },
} as const
