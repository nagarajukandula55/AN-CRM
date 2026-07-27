import type { InvoiceRenderData } from "./types";

/** Escapes user-controlled text before interpolating into an HTML template string. */
export function esc(v: unknown): string {
  if (v === undefined || v === null) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function fmtMoney(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

export function fmtDate(v: unknown): string {
  if (!v) return "N/A";
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? "N/A" : d.toLocaleDateString("en-IN");
}

/** Every layout renders the same underlying data; these are the safe accessors shared across layouts. */
export function safeStr(v: unknown, fallback = "N/A"): string {
  return v === undefined || v === null || v === "" ? fallback : esc(v);
}

export function totals(data: InvoiceRenderData) {
  return {
    subtotal: fmtMoney(data.summary?.subtotal),
    discount: fmtMoney(data.summary?.discount),
    taxable: fmtMoney(data.summary?.taxable),
    cgst: fmtMoney(data.summary?.cgst),
    sgst: fmtMoney(data.summary?.sgst),
    igst: fmtMoney(data.summary?.igst),
    grandTotal: fmtMoney(data.summary?.grandTotal),
  };
}
