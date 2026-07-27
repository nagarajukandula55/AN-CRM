"use client";

/**
 * Wordmark placeholder — swap for a real <Image src="/logo.svg" .../>
 * once the user has a final logo asset. Kept as its own component so
 * that swap is a one-file change.
 */
export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`text-xl font-bold tracking-tight text-[var(--text)] ${className}`}
    >
      AN Group
    </span>
  );
}
