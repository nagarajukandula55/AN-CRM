"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";

interface TicketMessage {
  from: "CUSTOMER" | "ADMIN";
  message: string;
  authorName?: string;
  createdAt: string;
}

interface Ticket {
  _id: string;
  ticketNumber: string;
  name: string;
  email?: string;
  phone?: string;
  orderId?: string;
  subject: string;
  status: "OPEN" | "IN_PROGRESS" | "CLOSED";
  messages: TicketMessage[];
  createdAt: string;
  businessId: string;
  businessName: string;
}

interface BusinessOption {
  _id: string;
  name: string;
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-warning-soft text-warning",
  IN_PROGRESS: "bg-info-soft text-info",
  CLOSED: "bg-surface-2 text-ink-3",
};

export default function SupportTicketsPage() {
  const [businessFilter, setBusinessFilter] = useState(""); // "" = all businesses
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [reply, setReply] = useState("");
  const [saving, setSaving] = useState(false);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [newTicketBusinessId, setNewTicketBusinessId] = useState("");
  const [newTicket, setNewTicket] = useState({ name: "", email: "", phone: "", orderId: "", subject: "", message: "" });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // For the business filter dropdown and the "+ New Ticket" business
  // picker -- doesn't depend on the sidebar's active-business switcher at
  // all, so it works regardless of whether that's behaving correctly.
  const { data: meData } = useSWR("/api/auth/me");
  const businesses: BusinessOption[] = meData?.businesses || [];
  useEffect(() => {
    if (businesses.length === 1) setNewTicketBusinessId(businesses[0]._id);
  }, [meData]);

  const ticketsParams = (() => {
    const params = new URLSearchParams();
    if (businessFilter) params.set("businessId", businessFilter);
    if (statusFilter) params.set("status", statusFilter);
    return params.toString();
  })();
  const { data: ticketsRes, isLoading: loading, mutate: load } = useSWR(
    `/api/support-tickets?${ticketsParams}`,
    { keepPreviousData: true }
  );
  const tickets: Ticket[] = ticketsRes?.success ? ticketsRes.tickets : [];

  async function submitReply(status?: string) {
    if (!selected) return;
    if (!reply.trim() && !status) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/support-tickets/${selected._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply.trim() || undefined, status }),
      });
      const data = await res.json();
      if (data.success) {
        setSelected(data.ticket);
        setReply("");
        load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function createTicket() {
    setCreateError(null);
    if (!newTicket.name.trim() || !newTicket.subject.trim() || !newTicket.message.trim()) {
      setCreateError("Name, subject, and message are required.");
      return;
    }
    if (!newTicket.email.trim() && !newTicket.phone.trim()) {
      setCreateError("Add an email or phone so you can follow up with them.");
      return;
    }
    if (!newTicketBusinessId) {
      setCreateError("Select which business this ticket belongs to.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`/api/storefront/support-tickets?businessId=${newTicketBusinessId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTicket),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setCreateError(data.message || "Failed to create ticket");
        return;
      }
      setShowNewTicket(false);
      setNewTicket({ name: "", email: "", phone: "", orderId: "", subject: "", message: "" });
      load();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Support Tickets</h1>
          <p className="text-sm text-ink-3 mt-1">
            Customer issues across every business — raised through a storefront where one exists, or logged here by
            your team on behalf of whoever called or walked in. Use the business filter below to narrow it down.
          </p>
        </div>
        <button
          onClick={() => setShowNewTicket(true)}
          className="shrink-0 px-3 py-2 bg-accent text-accent-fg rounded-control text-sm"
        >
          + New Ticket
        </button>
      </div>

      {showNewTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md bg-surface rounded-card p-5 space-y-3">
            <h2 className="font-semibold text-ink">Log a New Ticket</h2>
            {createError && <p className="text-xs text-danger">{createError}</p>}
            <select
              className="w-full border border-border rounded-control p-2 text-sm"
              value={newTicketBusinessId}
              onChange={(e) => setNewTicketBusinessId(e.target.value)}
            >
              <option value="">Select business *</option>
              {businesses.map((b) => (
                <option key={b._id} value={b._id}>{b.name}</option>
              ))}
            </select>
            <input
              className="w-full border border-border rounded-control p-2 text-sm"
              placeholder="Customer name *"
              value={newTicket.name}
              onChange={(e) => setNewTicket((p) => ({ ...p, name: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                className="w-full border border-border rounded-control p-2 text-sm"
                placeholder="Email"
                value={newTicket.email}
                onChange={(e) => setNewTicket((p) => ({ ...p, email: e.target.value }))}
              />
              <input
                className="w-full border border-border rounded-control p-2 text-sm"
                placeholder="Phone"
                value={newTicket.phone}
                onChange={(e) => setNewTicket((p) => ({ ...p, phone: e.target.value }))}
              />
            </div>
            <input
              className="w-full border border-border rounded-control p-2 text-sm"
              placeholder="Order / Job Sheet ID (optional)"
              value={newTicket.orderId}
              onChange={(e) => setNewTicket((p) => ({ ...p, orderId: e.target.value }))}
            />
            <input
              className="w-full border border-border rounded-control p-2 text-sm"
              placeholder="Subject *"
              value={newTicket.subject}
              onChange={(e) => setNewTicket((p) => ({ ...p, subject: e.target.value }))}
            />
            <textarea
              className="w-full border border-border rounded-control p-2 text-sm"
              rows={3}
              placeholder="What's the issue? *"
              value={newTicket.message}
              onChange={(e) => setNewTicket((p) => ({ ...p, message: e.target.value }))}
            />
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowNewTicket(false)} className="px-3 py-2 border border-border rounded-control text-sm">
                Cancel
              </button>
              <button
                onClick={createTicket}
                disabled={creating}
                className="px-3 py-2 bg-accent text-accent-fg rounded-control text-sm disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create Ticket"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {["", "OPEN", "IN_PROGRESS", "CLOSED"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-control text-xs font-medium border ${
              statusFilter === s ? "bg-accent text-accent-fg border-accent" : "text-ink-3 border-border"
            }`}
          >
            {s || "All Statuses"}
          </button>
        ))}
        <select
          className="px-3 py-1.5 rounded-control text-xs font-medium border border-border text-ink-3 ml-2"
          value={businessFilter}
          onChange={(e) => setBusinessFilter(e.target.value)}
        >
          <option value="">All Businesses</option>
          {businesses.map((b) => (
            <option key={b._id} value={b._id}>{b.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-1 rounded-card border border-border divide-y divide-border max-h-[70vh] overflow-y-auto">
          {loading ? (
            <p className="p-4 text-sm text-ink-3">Loading…</p>
          ) : tickets.length === 0 ? (
            <p className="p-4 text-sm text-ink-3">No tickets.</p>
          ) : (
            tickets.map((t) => (
              <button
                key={t._id}
                onClick={() => setSelected(t)}
                className={`w-full text-left p-3 hover:bg-surface-2 ${selected?._id === t._id ? "bg-surface-2" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-ink-3">{t.ticketNumber}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_COLORS[t.status]}`}>{t.status}</span>
                </div>
                <p className="text-sm font-medium text-ink mt-1 truncate">{t.subject}</p>
                <p className="text-xs text-ink-3">{t.name} {t.businessName && <>· {t.businessName}</>}</p>
              </button>
            ))
          )}
        </div>

        <div className="col-span-2 rounded-card border border-border p-4">
          {!selected ? (
            <p className="text-sm text-ink-3">Select a ticket to view the conversation.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-ink">{selected.subject}</p>
                  <p className="text-xs text-ink-3">
                    {selected.name} · {selected.email || "—"} · {selected.phone || "—"}
                    {selected.orderId && <> · Order: {selected.orderId}</>}
                  </p>
                  <p className="text-xs text-ink-3 font-mono">
                    {selected.ticketNumber} {selected.businessName && <>· {selected.businessName}</>}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[selected.status]}`}>{selected.status}</span>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto border-t border-b border-border py-3">
                {selected.messages.map((m, i) => (
                  <div key={i} className={`text-sm p-2 rounded-control max-w-[80%] ${m.from === "ADMIN" ? "bg-info-soft ml-auto" : "bg-surface-2"}`}>
                    <p className="text-[10px] text-ink-3">{m.authorName || m.from} · {new Date(m.createdAt).toLocaleString()}</p>
                    <p className="text-ink">{m.message}</p>
                  </div>
                ))}
              </div>

              <textarea
                className="w-full border border-border rounded-control p-2 text-sm"
                rows={3}
                placeholder="Reply to customer…"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />

              <div className="flex gap-2">
                <button
                  onClick={() => submitReply()}
                  disabled={saving || !reply.trim()}
                  className="px-3 py-2 bg-accent text-accent-fg rounded-control text-sm disabled:opacity-50"
                >
                  Send Reply
                </button>
                {selected.status !== "IN_PROGRESS" && (
                  <button onClick={() => submitReply("IN_PROGRESS")} disabled={saving} className="px-3 py-2 border border-border rounded-control text-sm">
                    Mark In Progress
                  </button>
                )}
                {selected.status !== "CLOSED" && (
                  <button onClick={() => submitReply("CLOSED")} disabled={saving} className="px-3 py-2 border border-border rounded-control text-sm text-danger">
                    Close Ticket
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
