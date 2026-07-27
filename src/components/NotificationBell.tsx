"use client";

/**
 * Notification bell as a floating icon + dropdown, replacing the old
 * "Notifications" sidebar page -- same backend (/api/notifications/*,
 * see src/app/api/notifications/route.ts) and same unread-count polling
 * this app already had, just surfaced as an always-reachable icon instead
 * of a full page navigation. Fixed top-right so it never collides with
 * ANu (bottom-left) or the toast stack (bottom-right).
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
  info: { icon: Info, color: "text-blue-500", bg: "bg-blue-50" },
  success: { icon: CheckCircle, color: "text-green-500", bg: "bg-green-50" },
  warning: { icon: AlertTriangle, color: "text-yellow-500", bg: "bg-yellow-50" },
  error: { icon: XCircle, color: "text-red-500", bg: "bg-red-50" },
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
        className="relative w-11 h-11 rounded-full bg-white border border-gray-200 shadow-md flex items-center justify-center hover:bg-gray-50 transition"
      >
        <Bell size={18} className="text-gray-700" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] max-h-[28rem] bg-white rounded-2xl border border-gray-200 shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-900">
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="text-xs text-gray-400 text-center py-8">Loading…</p>
            ) : items.length === 0 ? (
              <div className="text-center py-8">
                <Bell className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                <p className="text-xs text-gray-400">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {items.map((n) => {
                  const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.info;
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={n._id}
                      onClick={() => openNotification(n)}
                      className={`flex gap-2.5 px-4 py-3 ${!n.isRead ? "bg-blue-50/30" : ""} ${n.link ? "cursor-pointer hover:bg-gray-50" : ""}`}
                    >
                      <div className={`mt-0.5 w-7 h-7 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0`}>
                        <Icon size={13} className={cfg.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium ${n.isRead ? "text-gray-600" : "text-gray-900"}`}>{n.title}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">{n.message}</p>
                        <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.createdAt)}</p>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        {!n.isRead && (
                          <button onClick={(e) => { e.stopPropagation(); markRead(n._id); }} title="Mark as read" className="p-1 rounded text-gray-400 hover:text-green-600">
                            <Check size={12} />
                          </button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); remove(n._id); }} title="Delete" className="p-1 rounded text-gray-400 hover:text-red-600">
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
