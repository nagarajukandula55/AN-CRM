"use client";

/**
 * Notification bell as a floating icon + dropdown -- same backend
 * (/api/notifications/*, see src/app/api/notifications/route.ts) and same
 * unread-count polling this app already had. Fixed top-right, per
 * explicit direction that every notification surface should live there.
 * Revived for the vendor portal (previously folded into AnuWidget's
 * showNotifications prop -- ANu widget removed from the vendor portal,
 * see vendor/layout.tsx's own comment).
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck, Trash2, Info, AlertTriangle, CheckCircle, XCircle } from "lucide-react";

interface NotificationItem {
  _id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  isRead: boolean;
  createdAt: string;
  link?: string;
}

const TYPE_CONFIG = {
  info: { icon: Info, className: "text-info bg-info-soft" },
  success: { icon: CheckCircle, className: "text-success bg-success-soft" },
  warning: { icon: AlertTriangle, className: "text-warning bg-warning-soft" },
  error: { icon: XCircle, className: "text-danger bg-danger-soft" },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setBusinessId(d.user?.activeBusinessId ?? d.businesses?.[0]?._id ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function load(silent = false) {
    if (!silent) setLoading(true);
    fetch(`/api/notifications${businessId ? `?businessId=${businessId}` : ""}`)
      .then((r) => r.json())
      .then((d) => setItems(d.notifications ?? []))
      .catch(() => {})
      .finally(() => { if (!silent) setLoading(false); });
  }

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Background poll so the unread badge updates even while the panel is
  // closed (e.g. a super admin sees a new vendor-application alert appear
  // without having to click the bell first) -- previously only loaded on
  // open, despite a comment claiming this polling already existed.
  useEffect(() => {
    load(true);
    const interval = setInterval(() => load(true), 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  const unreadCount = items.filter((n) => !n.isRead).length;

  async function markRead(id: string) {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
      setItems((prev) => prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)));
    } catch {
      /* best-effort */
    }
  }

  async function markAllRead() {
    if (!businessId) return;
    try {
      await fetch("/api/notifications/read-all", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId }),
      });
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      /* best-effort */
    }
  }

  function openNotification(n: NotificationItem) {
    if (!n.isRead) markRead(n._id);
    if (n.link) {
      setOpen(false);
      router.push(n.link);
    }
  }

  async function remove(id: string) {
    try {
      await fetch(`/api/notifications/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((n) => n._id !== id));
    } catch {
      /* best-effort */
    }
  }

  return (
    <div ref={panelRef} className="fixed top-4 right-4 z-40">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative w-11 h-11 rounded-full bg-surface border border-border shadow-card flex items-center justify-center hover:bg-surface-2 transition"
      >
        <Bell size={18} className="text-ink-2" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] max-h-[28rem] bg-surface rounded-card border border-border shadow-card-lg flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold text-ink">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="flex items-center gap-1 text-[11px] text-ink-3 hover:text-ink">
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="text-xs text-ink-3 text-center py-8">Loading…</p>
            ) : items.length === 0 ? (
              <div className="text-center py-8">
                <Bell className="w-8 h-8 mx-auto mb-2 text-ink-3" />
                <p className="text-xs text-ink-3">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {items.map((n) => {
                  const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.info;
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={n._id}
                      onClick={() => openNotification(n)}
                      className={`flex gap-2.5 px-4 py-3 ${!n.isRead ? "bg-accent-soft" : ""} ${n.link ? "cursor-pointer hover:bg-surface-2" : ""}`}
                    >
                      <div className={`mt-0.5 w-7 h-7 rounded-control ${cfg.className} flex items-center justify-center shrink-0`}>
                        <Icon size={13} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium ${n.isRead ? "text-ink-2" : "text-ink"}`}>{n.title}</p>
                        <p className="text-[11px] text-ink-3 mt-0.5">{n.message}</p>
                        <p className="text-[10px] text-ink-3 mt-1">{timeAgo(n.createdAt)}</p>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        {!n.isRead && (
                          <button onClick={(e) => { e.stopPropagation(); markRead(n._id); }} title="Mark as read" className="p-1 rounded text-ink-3 hover:text-success">
                            <Check size={12} />
                          </button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); remove(n._id); }} title="Delete" className="p-1 rounded text-ink-3 hover:text-danger">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
