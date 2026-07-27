'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/sidebar';
import AnuWidget from '@/components/AnuWidget';
// NotificationBell removed -- per explicit direction, everything (approvals,
// updates) is delivered through ANu-branded prompts (see
// components/shared/Toast.tsx) instead of a separate bell/dropdown.
//
// BUG (fixed here): AnuWidget's notification tab (bell icon, unread badge,
// mark-read/delete -- reads real data from /api/notifications) only renders
// when passed `showNotifications`. The vendor portal's layout.tsx already
// passes it; this admin shell never did, so every /admin/* page rendered
// ANu with NO notification tab at all despite the comment above claiming
// "everything is delivered through ANu." Also mounted the widget on the
// full-bleed branch below (CRM call/jobsheet detail + print sub-routes),
// which previously rendered no AnuWidget whatsoever -- those pages had
// literally no notification/alert surface of any kind.

// Appointment/workorder "processing" screens (and their print sub-routes)
// are deliberately full-screen with no sidebar -- they were being squeezed
// into the leftover width next to the fixed sidebar ("small window within
// window"). Matches the detail route and any sub-route under it (e.g.
// .../print) but not the bare list pages (/admin/crm/calls, /admin/crm/jobsheets).
const FULL_BLEED_PATTERN = /^\/admin\/crm\/(calls|jobsheets)\/[^/]+/;

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '';
  const fullBleed = FULL_BLEED_PATTERN.test(pathname);

  if (fullBleed) {
    return (
      <div className="min-h-screen bg-bg">
        {children}
        <AnuWidget showNotifications />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      <AnuWidget showNotifications />
    </div>
  );
}
