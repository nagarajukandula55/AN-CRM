"use client";

import { SWRConfig } from "swr";
import { swrFetcher } from "@/lib/swrFetcher";

/**
 * App-wide SWR defaults. `dedupingInterval` is the actual fix for the
 * "same GET fired 3+ times on one page load" pattern found across the app
 * (sidebar + AnuWidget + a page's own fetch all asking for overlapping
 * data within the same render) -- any two useSWR() calls for the same key
 * within this window share one request instead of each starting their own.
 * revalidateOnFocus is off because a CRM/ERP admin tabbing back in mid-task
 * shouldn't have list data silently shift under them; pages that genuinely
 * want live-refresh (e.g. a notification count) opt back in per-call via
 * `refreshInterval`.
 */
export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher: swrFetcher,
        dedupingInterval: 4000,
        revalidateOnFocus: false,
        revalidateIfStale: true,
        shouldRetryOnError: false,
      }}
    >
      {children}
    </SWRConfig>
  );
}
