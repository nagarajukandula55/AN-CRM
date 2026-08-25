"use client";

/**
 * Floating "Contact us for help" button -- replaces the ANu assistant
 * widget in the vendor portal (removed per explicit direction). Expands
 * to WhatsApp/Telegram deep links (wa.me / t.me, no API/cost involved --
 * see api/vendor/support-contact's own comment on why an in-app WhatsApp
 * session would need the paid Business Platform API instead) plus a link
 * to the Help Center's tutorial videos. A button only renders when the
 * admin has actually configured that contact method (Settings > Business
 * Profile) -- never a placeholder/fake number.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle, X, Send, PlayCircle } from "lucide-react";

export default function ContactWidget() {
  const [open, setOpen] = useState(false);
  const [whatsAppNumber, setWhatsAppNumber] = useState("");
  const [telegramUsername, setTelegramUsername] = useState("");

  useEffect(() => {
    fetch("/api/vendor/support-contact")
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) return;
        setWhatsAppNumber(d.whatsAppNumber || "");
        setTelegramUsername(d.telegramUsername || "");
      })
      .catch(() => {});
  }, []);

  const waLink = whatsAppNumber
    ? `https://wa.me/${whatsAppNumber.replace(/[^\d]/g, "")}?text=${encodeURIComponent("Hi, I need help with my account.")}`
    : null;
  // Telegram opens the INBUILT chat (/vendor/telegram) rather than the
  // external app -- see components/vendor/VendorTelegramChat.tsx. Only
  // shown once support Telegram is configured, same as WhatsApp, even
  // though the destination itself is in-app rather than a t.me link.
  const hasTelegram = !!telegramUsername;

  return (
    <div style={{ position: "fixed", bottom: "1.5rem", right: "1.5rem", zIndex: 50 }}>
      {open && (
        <div className="mb-3 w-64 bg-surface border border-border rounded-card shadow-card-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-ink">Need help?</p>
            <p className="text-xs text-ink-3">Reach us directly, or browse tutorials.</p>
          </div>
          <div className="p-2 space-y-1">
            {waLink && (
              <a href={waLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-3 py-2 rounded-control text-sm text-ink-2 hover:bg-surface-2 transition-colors">
                <MessageCircle size={16} className="text-success" /> Chat on WhatsApp
              </a>
            )}
            {hasTelegram && (
              <Link href="/vendor/telegram" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-3 py-2 rounded-control text-sm text-ink-2 hover:bg-surface-2 transition-colors">
                <Send size={16} className="text-accent" /> Chat on Telegram
              </Link>
            )}
            {!waLink && !hasTelegram && (
              <p className="px-3 py-2 text-xs text-ink-3">Contact options aren't set up yet.</p>
            )}
            <Link href="/vendor/help" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-3 py-2 rounded-control text-sm text-ink-2 hover:bg-surface-2 transition-colors">
              <PlayCircle size={16} className="text-ink-3" /> Help & Tutorials
            </Link>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Contact us for help"
        className="w-14 h-14 rounded-full bg-accent text-accent-fg shadow-card-lg flex items-center justify-center hover:bg-accent-hover transition-colors"
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>
    </div>
  );
}
