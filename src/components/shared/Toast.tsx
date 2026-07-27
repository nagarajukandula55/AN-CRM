"use client";

/**
 * System-wide ephemeral notifications, delivered as an ANu prompt rather
 * than a generic toast or the separate notification-bell dropdown -- per
 * explicit direction, every approval/update confirmation should come
 * through ANu, personalized ("Hey Nagaraj, settings applied
 * successfully"), as a lightweight prompt rather than opening ANu's full
 * chat window. Every existing toast.success()/error()/etc call site across
 * the app is unchanged -- this file is the one place that renders them,
 * so the personalization + ANu branding applies everywhere at once.
 *
 * Usage: const toast = useToast(); toast.success("Saved"); toast.error("...");
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X, Bot } from "lucide-react";

type ToastType = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  show: (type: ToastType, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TYPE_CONFIG: Record<ToastType, { icon: typeof CheckCircle; className: string }> = {
  success: { icon: CheckCircle, className: "border-green-200 bg-green-50 text-green-800" },
  error: { icon: XCircle, className: "border-red-200 bg-red-50 text-red-800" },
  warning: { icon: AlertTriangle, className: "border-yellow-200 bg-yellow-50 text-yellow-800" },
  info: { icon: Info, className: "border-blue-200 bg-blue-50 text-blue-800" },
};

const AUTO_DISMISS_MS = 5000;

// Lowercases the message's leading letter when it's being appended after
// a "Hey {name}, " greeting, e.g. "Settings applied successfully" ->
// "settings applied successfully" so the combined sentence reads
// naturally instead of a capital letter appearing mid-sentence.
function lowercaseFirst(message: string): string {
  return message.length ? message[0].toLowerCase() + message.slice(1) : message;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  // First name only, for the "Hey {name}, ..." greeting -- fetched once
  // and cached for the session rather than re-fetched per toast.
  const [firstName, setFirstName] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        const full = d?.user?.name as string | undefined;
        if (full) setFirstName(full.trim().split(/\s+/)[0]);
      })
      .catch(() => {});
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (type: ToastType, message: string) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      success: (message: string) => show("success", message),
      error: (message: string) => show("error", message),
      warning: (message: string) => show("warning", message),
      info: (message: string) => show("info", message),
    }),
    [show]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
        {toasts.map((t) => {
          const cfg = TYPE_CONFIG[t.type];
          const Icon = cfg.icon;
          const greeting = firstName ? `Hey ${firstName}, ` : "";
          return (
            <div
              key={t.id}
              role="status"
              className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-lg ${cfg.className}`}
            >
              <div className="shrink-0 mt-0.5 relative">
                <Bot size={16} />
                <Icon size={10} className="absolute -bottom-1 -right-1 rounded-full bg-white" />
              </div>
              <p className="flex-1 leading-snug">
                <span className="font-medium">{greeting}</span>
                {greeting ? lowercaseFirst(t.message) : t.message}
              </p>
              <button
                onClick={() => dismiss(t.id)}
                className="shrink-0 opacity-60 hover:opacity-100 transition"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast() must be used within a <ToastProvider>");
  }
  return ctx;
}
