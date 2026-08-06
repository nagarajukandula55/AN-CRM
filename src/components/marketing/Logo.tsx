"use client";

/**
 * Wordmark placeholder — swap for a real <Image src="/logo.svg" .../>
 * once the user has a final logo asset. Kept as its own component so
 * that swap is a one-file change. Text-only, no icon/mark, per explicit
 * direction ("logo will upload soon for now hold the icon visibility we
 * will complete that shortly") -- once a real logo exists, this becomes
 * an <Image> and nothing else in the marketing pages needs to change.
 *
 * Public-facing product name is "My Biz Flow" -- AN-CRM is this app's
 * internal/repo name only, never shown to an outside visitor.
 */
export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`text-xl font-bold tracking-tight text-[var(--text)] ${className}`}
    >
      My Biz Flow
    </span>
  );
}
