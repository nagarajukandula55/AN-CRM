"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

/**
 * The vendor portal layout (app/vendor/layout.tsx) is a server component
 * with no logout control anywhere -- a vendor who logs in has no way to
 * sign out short of manually clearing cookies. Small client component so
 * the (async, server-rendered) layout can stay a server component.
 */
export default function VendorLogoutButton() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore — still redirect below regardless
    }
    router.push("/login");
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loggingOut}
      className="mt-3 flex w-full items-center justify-center gap-2 rounded-control border border-border bg-surface px-3 py-2 text-xs font-medium text-ink-2 transition hover:bg-surface-2 hover:text-ink disabled:opacity-50"
    >
      <LogOut className="h-3.5 w-3.5" />
      {loggingOut ? "Signing out…" : "Sign Out"}
    </button>
  );
}
