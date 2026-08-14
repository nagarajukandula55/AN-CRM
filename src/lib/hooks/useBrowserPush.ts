"use client";

import { useEffect } from "react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

/**
 * Registers public/sw.js and subscribes this browser to Web Push, once,
 * the first time a logged-in user lands on a console page that mounts
 * this hook -- no visible UI of its own; the browser's own native
 * permission prompt is the only thing the user sees. Silently no-ops on
 * unsupported browsers, over http (non-localhost), or if the user has
 * already denied/dismissed the permission before (never re-prompts a
 * "denied" state -- that's the browser's own decision to respect).
 *
 * A previously-granted subscription is re-registered with the backend on
 * every mount (cheap upsert, see api/push/subscribe) so a subscription
 * that only exists in the browser's own storage (e.g. after a DB reset)
 * gets re-saved without the user having to do anything.
 */
export function useBrowserPush(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) return;
    if (Notification.permission === "denied") return;

    let cancelled = false;

    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");

        let existing = await reg.pushManager.getSubscription();
        if (!existing) {
          const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
          if (permission !== "granted" || cancelled) return;
          existing = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
          });
        }
        if (cancelled) return;

        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: existing.toJSON() }),
        }).catch(() => {});
      } catch {
        // Best-effort -- push is a nice-to-have, never blocks the app.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);
}
