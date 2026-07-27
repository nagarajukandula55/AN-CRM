"use client";

/**
 * ANu floating overlay — available on every admin page without disturbing
 * any existing UI (fixed-position bubble, opens a slide-up panel, closes on
 * its own click, doesn't intercept clicks anywhere else on the page).
 * Talks to the existing /api/anu (core/anu/anuService.ts + knowledgeBase.ts)
 * -- this widget doesn't add any new AI logic, just a persistent, always-
 * reachable place to use what already exists, plus a lightweight
 * "Teach ANu" quick-add wired to /api/anu/knowledge so the assistant's
 * knowledge can grow from the UI without a code deploy.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, X, Send, GraduationCap, Bell, Check, CheckCheck, Trash2, Info, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { getAuthMe } from "@/lib/authMeCache";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface NotificationItem {
  _id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  isRead: boolean;
  createdAt: string;
  link?: string;
}

const NOTIF_TYPE_CONFIG = {
  info: { icon: Info, color: "text-info", bg: "bg-info-soft" },
  success: { icon: CheckCircle, color: "text-success", bg: "bg-success-soft" },
  warning: { icon: AlertTriangle, color: "text-warning", bg: "bg-warning-soft" },
  error: { icon: XCircle, color: "text-danger", bg: "bg-danger-soft" },
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

// `showNotifications` folds the separate floating NotificationBell into
// this same widget instead of a second always-on-screen icon -- per
// explicit direction for the vendor portal specifically ("remove bell
// icon and push all type of notifications through ANu"). Admin usage is
// unchanged (prop omitted there), so this is additive, not a behavior
// change for admin pages.
export default function AnuWidget({ showNotifications = false }: { showNotifications?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [teachOpen, setTeachOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const [teachTopic, setTeachTopic] = useState("");
  const [teachSummary, setTeachSummary] = useState("");
  const [teachSaving, setTeachSaving] = useState(false);
  const [teachMsg, setTeachMsg] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getAuthMe()
      .then((d) => {
        // Falls back to the first business when there's no activeBusinessId
        // (e.g. a super admin who hasn't switched into one yet) -- without
        // this fallback, send() silently no-op'd whenever businessId was
        // null, which looked exactly like "the send button does nothing".
        setBusinessId(d.user?.activeBusinessId ?? d.businesses?.[0]?._id ?? null);
        setIsSuperAdmin(!!d.user?.isSuperAdmin);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  function loadNotifications(silent = false) {
    if (!showNotifications) return;
    if (!silent) setNotifLoading(true);
    fetch(`/api/notifications${businessId ? `?businessId=${businessId}` : ""}`)
      .then((r) => r.json())
      .then((d) => setNotifications(d.notifications ?? []))
      .catch(() => {})
      .finally(() => { if (!silent) setNotifLoading(false); });
  }

  // Background poll so the unread badge on the launcher bubble updates
  // even while the panel is closed -- same behavior the standalone bell
  // this replaces already had.
  useEffect(() => {
    if (!showNotifications) return;
    loadNotifications(true);
    const interval = setInterval(() => loadNotifications(true), 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNotifications, businessId]);

  useEffect(() => {
    if (notifOpen) loadNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifOpen]);

  async function markNotifRead(id: string) {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
      setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)));
    } catch { /* best-effort */ }
  }

  async function markAllNotifsRead() {
    if (!businessId) return;
    try {
      await fetch("/api/notifications/read-all", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch { /* best-effort */ }
  }

  async function removeNotif(id: string) {
    try {
      await fetch(`/api/notifications/${id}`, { method: "DELETE" });
      setNotifications((prev) => prev.filter((n) => n._id !== id));
    } catch { /* best-effort */ }
  }

  function openNotification(n: NotificationItem) {
    if (!n.isRead) markNotifRead(n._id);
    if (n.link) {
      setOpen(false);
      router.push(n.link);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    if (!businessId) {
      setError("Select a business first (top of the sidebar) so ANu knows what to look at.");
      return;
    }
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/anu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, messages: nextMessages }),
      });
      const data = await res.json();
      if (data.success) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      } else {
        setError(data.error || "ANu could not answer that.");
      }
    } catch {
      setError("Failed to connect to ANu.");
    } finally {
      setSending(false);
    }
  }

  async function teach() {
    if (!teachTopic.trim() || !teachSummary.trim()) return;
    setTeachSaving(true);
    setTeachMsg(null);
    try {
      const res = await fetch("/api/anu/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, topic: teachTopic.trim(), summary: teachSummary.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setTeachMsg("ANu learned it.");
        setTeachTopic("");
        setTeachSummary("");
      } else {
        setTeachMsg(data.message || "Failed to save.");
      }
    } catch {
      setTeachMsg("Failed to connect to server.");
    } finally {
      setTeachSaving(false);
    }
  }

  return (
    <>
      {/* Launcher bubble — bottom-right. Previously bottom-left, but that
          put it directly behind the admin sidebar (fixed/sticky, z-50,
          full-height, opaque, anchored to the left edge), which painted
          over it completely: the button was in the DOM and functioning,
          just visually hidden underneath the sidebar on every page. */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="ANu"
        style={{ position: "fixed", bottom: "1.5rem", right: "1.5rem" }}
        className={`z-40 w-14 h-14 rounded-full bg-gradient-to-br from-accent to-accent-hover text-accent-fg shadow-card-lg flex items-center justify-center hover:opacity-90 hover:scale-110 active:scale-95 transition-transform duration-150 relative ${
          !open ? "anu-avatar-idle" : ""
        }`}
      >
        {open ? <X size={20} /> : <Bot size={22} />}
        {!open && showNotifications && unreadCount > 0 ? (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center border-2 border-surface">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : !open && (
          <span className="absolute top-0 right-0 w-3 h-3 rounded-full bg-success border-2 border-surface animate-pulse" />
        )}
      </button>

      {open && (
        <div
          style={{ position: "fixed", bottom: "6rem", right: "1.5rem" }}
          className="z-40 w-80 max-w-[calc(100vw-3rem)] h-[28rem] max-h-[70vh] bg-surface rounded-card border border-border shadow-card-lg flex flex-col overflow-hidden transition-all duration-200"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-accent text-accent-fg">
            <div className="flex items-center gap-2">
              <Bot size={16} />
              <span className="text-sm font-semibold">{notifOpen ? "Notifications" : "ANu"}</span>
            </div>
            <div className="flex items-center gap-1">
              {showNotifications && (
                <button
                  onClick={() => setNotifOpen((v) => !v)}
                  title="Notifications"
                  className="relative p-1.5 rounded-control hover:bg-white/10 transition"
                >
                  <Bell size={15} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-danger text-white text-[9px] font-bold flex items-center justify-center">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>
              )}
              {isSuperAdmin && !notifOpen && (
                <button
                  onClick={() => setTeachOpen((v) => !v)}
                  title="Teach ANu something new"
                  className="p-1.5 rounded-control hover:bg-white/10 transition"
                >
                  <GraduationCap size={15} />
                </button>
              )}
            </div>
          </div>

          {notifOpen ? (
            <div className="flex-1 overflow-y-auto">
              {notifLoading ? (
                <p className="text-xs text-ink-3 text-center py-8">Loading…</p>
              ) : notifications.length === 0 ? (
                <div className="text-center py-8">
                  <Bell className="w-8 h-8 mx-auto mb-2 text-ink-3" />
                  <p className="text-xs text-ink-3">No notifications yet</p>
                </div>
              ) : (
                <>
                  {unreadCount > 0 && (
                    <div className="flex justify-end px-4 pt-3">
                      <button onClick={markAllNotifsRead} className="flex items-center gap-1 text-[11px] text-ink-3 hover:text-ink">
                        <CheckCheck size={12} /> Mark all read
                      </button>
                    </div>
                  )}
                  <div className="divide-y divide-border">
                    {notifications.map((n) => {
                      const cfg = NOTIF_TYPE_CONFIG[n.type] || NOTIF_TYPE_CONFIG.info;
                      const Icon = cfg.icon;
                      return (
                        <div
                          key={n._id}
                          onClick={() => openNotification(n)}
                          className={`flex gap-2.5 px-4 py-3 ${!n.isRead ? "bg-info-soft" : ""} ${n.link ? "cursor-pointer hover:bg-surface-2" : ""}`}
                        >
                          <div className={`mt-0.5 w-7 h-7 rounded-control ${cfg.bg} flex items-center justify-center shrink-0`}>
                            <Icon size={13} className={cfg.color} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-medium ${n.isRead ? "text-ink-2" : "text-ink"}`}>{n.title}</p>
                            <p className="text-[11px] text-ink-3 mt-0.5">{n.message}</p>
                            <p className="text-[10px] text-ink-3 mt-1">{timeAgo(n.createdAt)}</p>
                          </div>
                          <div className="flex flex-col gap-1 shrink-0">
                            {!n.isRead && (
                              <button onClick={(e) => { e.stopPropagation(); markNotifRead(n._id); }} title="Mark as read" className="p-1 rounded text-ink-3 hover:text-success">
                                <Check size={12} />
                              </button>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); removeNotif(n._id); }} title="Delete" className="p-1 rounded text-ink-3 hover:text-danger">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ) : (
          <>
          {teachOpen && (
            <div className="px-4 py-3 border-b border-border bg-surface-2 space-y-2">
              <input
                value={teachTopic}
                onChange={(e) => setTeachTopic(e.target.value)}
                placeholder="Topic (e.g. Refund Policy)"
                className="w-full text-xs border border-border-strong rounded-control px-2.5 py-1.5 outline-none focus:border-accent bg-surface text-ink"
              />
              <textarea
                value={teachSummary}
                onChange={(e) => setTeachSummary(e.target.value)}
                placeholder="What should ANu know?"
                rows={2}
                className="w-full text-xs border border-border-strong rounded-control px-2.5 py-1.5 outline-none focus:border-accent bg-surface text-ink resize-none"
              />
              <div className="flex items-center justify-between">
                <button
                  onClick={teach}
                  disabled={teachSaving}
                  className="text-xs font-medium bg-accent text-accent-fg rounded-control px-3 py-1.5 hover:bg-accent-hover disabled:opacity-50"
                >
                  {teachSaving ? "Saving…" : "Teach ANu"}
                </button>
                {teachMsg && <span className="text-[10px] text-ink-3">{teachMsg}</span>}
              </div>
            </div>
          )}

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
            {messages.length === 0 && (
              <p className="text-xs text-ink-3">
                Ask me how something in this app works — modules, permissions, document numbering, HR, CRM, vendors, the mobile app, anything. Try me in any language — just type your question the way you'd normally write it. I keep track of what we've discussed, so you don't have to repeat context every time.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-control px-3 py-2 text-xs leading-relaxed transition-opacity duration-150 ${
                  m.role === "user" ? "ml-auto bg-accent text-accent-fg" : "bg-surface-2 text-ink"
                }`}
              >
                {m.content}
              </div>
            ))}
            {sending && (
              <div className="flex items-center gap-1 bg-surface-2 rounded-control px-3 py-2.5 w-fit">
                <span className="w-1.5 h-1.5 rounded-full bg-ink-3 animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-ink-3 animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-ink-3 animate-bounce" />
              </div>
            )}
            {error && <p className="text-xs text-danger">{error}</p>}
          </div>

          <div className="flex items-center gap-2 px-3 py-2.5 border-t border-border">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
              placeholder="Ask ANu…"
              className="flex-1 text-xs border border-border-strong rounded-control px-3 py-2 outline-none focus:border-accent bg-surface text-ink"
            />
            <button
              onClick={send}
              disabled={sending || !input.trim()}
              className="w-8 h-8 rounded-control bg-accent text-accent-fg flex items-center justify-center hover:bg-accent-hover disabled:opacity-40 transition shrink-0"
            >
              <Send size={13} />
            </button>
          </div>
          </>
          )}
        </div>
      )}
    </>
  );
}
