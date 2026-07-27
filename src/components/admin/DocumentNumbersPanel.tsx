"use client";

import React, { useState, useEffect } from "react";
import { DOCUMENT_NUMBER_TOKENS } from "@/core/numbering/types";

/**
 * Document numbering configuration, embedded directly into a business's
 * own view page (admin/business/[id]) instead of living as a separate,
 * hard-to-find route -- per explicit direction ("attach entire document
 * numbering system to Business view page only... with a separate page
 * this is not at all able to use it"). Was also independently
 * half-duplicated (a simpler prefix/startFrom/active-only version) inside
 * admin/settings's "numbering" tab, which is exactly the kind of drift
 * that made this look like it "wasn't updating properly" -- editing in
 * one place never touched the fields the other place didn't know about.
 * This is now the ONE place; the standalone page and the settings tab are
 * both removed.
 */

type DocumentType =
  | "INVOICE"
  | "SALES_ORDER"
  | "PURCHASE_ORDER"
  | "GRN"
  | "CREDIT_NOTE"
  | "DEBIT_NOTE"
  | "QUOTATION"
  | "DELIVERY_CHALLAN"
  | "PAYMENT_RECEIPT"
  | "PRODUCTION_ORDER"
  | "PRODUCT"
  | "PRODUCT_VARIANT"
  | "VENDOR_PRODUCT"
  | "STOCK_ADJUSTMENT"
  | "STOCK_TRANSFER"
  | "BATCH"
  | "CUSTOMER_ORDER"
  | "RECEIPT"
  | "AGREEMENT"
  | "VENDOR"
  | "EMPLOYEE"
  | "BUSINESS"
  | "VENDOR_REQUEST"
  | "STORE_FRONT"
  | "SERVICE_CENTER"
  | "WAREHOUSE"
  | "CALL"
  | "JOB_SHEET"
  | "MATERIAL"
  | "NON_GST_INVOICE"
  | "B2B_INVOICE"
  | "PROFORMA_INVOICE"
  | "ROLE";

interface DocumentConfig {
  documentType: DocumentType;
  prefix: string;
  separator: string;
  includeFinancialYear: boolean;
  financialYearFormat?: "hyphenated" | "compact";
  includeMonth: boolean;
  sequenceLength: number;
  suffix: string;
  template?: string;
  startFrom: number;
}

interface CardState {
  current: DocumentConfig;
  saved: DocumentConfig;
  isOpen: boolean;
  isSaving: boolean;
  successMsg: string | null;
  errorMsg: string | null;
}

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  INVOICE: "Invoice",
  SALES_ORDER: "Sales Order",
  PURCHASE_ORDER: "Purchase Order",
  GRN: "Goods Receipt Note",
  CREDIT_NOTE: "Credit Note",
  DEBIT_NOTE: "Debit Note",
  QUOTATION: "Quotation",
  DELIVERY_CHALLAN: "Delivery Challan",
  PAYMENT_RECEIPT: "Payment Receipt",
  PRODUCTION_ORDER: "Production Order",
  PRODUCT: "Product Code",
  PRODUCT_VARIANT: "Product Variant Code",
  VENDOR_PRODUCT: "Vendor Product Code",
  STOCK_ADJUSTMENT: "Stock Adjustment",
  STOCK_TRANSFER: "Stock Transfer",
  BATCH: "Batch Number",
  CUSTOMER_ORDER: "Customer Order",
  RECEIPT: "Receipt",
  AGREEMENT: "Agreement Number",
  VENDOR: "Vendor ID",
  EMPLOYEE: "Employee ID",
  BUSINESS: "Business Code",
  VENDOR_REQUEST: "Vendor Request Number",
  STORE_FRONT: "Store Front ID",
  SERVICE_CENTER: "Service Center ID",
  WAREHOUSE: "Warehouse ID",
  CALL: "CRM Call Number",
  JOB_SHEET: "CRM Job Sheet Number",
  MATERIAL: "Material Code",
  NON_GST_INVOICE: "Non-GST Invoice (Bill)",
  B2B_INVOICE: "B2B Invoice",
  PROFORMA_INVOICE: "Proforma Invoice",
  ROLE: "Role Number",
};

const DEFAULT_CONFIGS: Record<DocumentType, DocumentConfig> = {
  INVOICE: { documentType: "INVOICE", prefix: "INV", separator: "/", includeFinancialYear: true, includeMonth: false, sequenceLength: 4, suffix: "", startFrom: 1 },
  SALES_ORDER: { documentType: "SALES_ORDER", prefix: "SO", separator: "/", includeFinancialYear: true, includeMonth: false, sequenceLength: 4, suffix: "", startFrom: 1 },
  PURCHASE_ORDER: { documentType: "PURCHASE_ORDER", prefix: "PO", separator: "/", includeFinancialYear: true, includeMonth: false, sequenceLength: 4, suffix: "", startFrom: 1 },
  GRN: { documentType: "GRN", prefix: "GRN", separator: "/", includeFinancialYear: true, includeMonth: false, sequenceLength: 4, suffix: "", startFrom: 1 },
  CREDIT_NOTE: { documentType: "CREDIT_NOTE", prefix: "CN", separator: "/", includeFinancialYear: true, includeMonth: false, sequenceLength: 4, suffix: "", startFrom: 1 },
  DEBIT_NOTE: { documentType: "DEBIT_NOTE", prefix: "DN", separator: "/", includeFinancialYear: true, includeMonth: false, sequenceLength: 4, suffix: "", startFrom: 1 },
  QUOTATION: { documentType: "QUOTATION", prefix: "QT", separator: "/", includeFinancialYear: true, includeMonth: false, sequenceLength: 4, suffix: "", startFrom: 1 },
  DELIVERY_CHALLAN: { documentType: "DELIVERY_CHALLAN", prefix: "DC", separator: "/", includeFinancialYear: true, includeMonth: false, sequenceLength: 4, suffix: "", startFrom: 1 },
  PAYMENT_RECEIPT: { documentType: "PAYMENT_RECEIPT", prefix: "PR", separator: "/", includeFinancialYear: true, includeMonth: false, sequenceLength: 4, suffix: "", startFrom: 1 },
  PRODUCTION_ORDER: { documentType: "PRODUCTION_ORDER", prefix: "PROD", separator: "/", includeFinancialYear: true, includeMonth: false, sequenceLength: 4, suffix: "", startFrom: 1 },
  PRODUCT: { documentType: "PRODUCT", prefix: "PRD", separator: "-", includeFinancialYear: false, includeMonth: false, sequenceLength: 5, suffix: "", startFrom: 1 },
  PRODUCT_VARIANT: { documentType: "PRODUCT_VARIANT", prefix: "VAR", separator: "-", includeFinancialYear: false, includeMonth: false, sequenceLength: 5, suffix: "", startFrom: 1 },
  VENDOR_PRODUCT: { documentType: "VENDOR_PRODUCT", prefix: "VPRD", separator: "-", includeFinancialYear: false, includeMonth: false, sequenceLength: 5, suffix: "", startFrom: 1 },
  STOCK_ADJUSTMENT: { documentType: "STOCK_ADJUSTMENT", prefix: "SA", separator: "/", includeFinancialYear: true, includeMonth: false, sequenceLength: 4, suffix: "", startFrom: 1 },
  STOCK_TRANSFER: { documentType: "STOCK_TRANSFER", prefix: "TRF", separator: "/", includeFinancialYear: true, includeMonth: false, sequenceLength: 4, suffix: "", startFrom: 1 },
  BATCH: { documentType: "BATCH", prefix: "BAT", separator: "-", includeFinancialYear: false, includeMonth: false, sequenceLength: 5, suffix: "", startFrom: 1 },
  CUSTOMER_ORDER: { documentType: "CUSTOMER_ORDER", prefix: "ORD", separator: "/", includeFinancialYear: true, includeMonth: false, sequenceLength: 4, suffix: "", startFrom: 1 },
  RECEIPT: { documentType: "RECEIPT", prefix: "RCT", separator: "/", includeFinancialYear: true, includeMonth: false, sequenceLength: 4, suffix: "", startFrom: 1 },
  AGREEMENT: { documentType: "AGREEMENT", prefix: "AGR", separator: "/", includeFinancialYear: true, includeMonth: false, sequenceLength: 4, suffix: "", startFrom: 1 },
  VENDOR: { documentType: "VENDOR", prefix: "VND", separator: "-", includeFinancialYear: false, includeMonth: false, sequenceLength: 4, suffix: "", startFrom: 1 },
  EMPLOYEE: { documentType: "EMPLOYEE", prefix: "EMP", separator: "-", includeFinancialYear: false, includeMonth: false, sequenceLength: 4, suffix: "", startFrom: 1 },
  BUSINESS: { documentType: "BUSINESS", prefix: "BUS", separator: "-", includeFinancialYear: false, includeMonth: false, sequenceLength: 4, suffix: "", startFrom: 1 },
  VENDOR_REQUEST: { documentType: "VENDOR_REQUEST", prefix: "VREQ", separator: "-", includeFinancialYear: false, includeMonth: false, sequenceLength: 4, suffix: "", startFrom: 1 },
  STORE_FRONT: { documentType: "STORE_FRONT", prefix: "SF", separator: "-", includeFinancialYear: false, includeMonth: false, sequenceLength: 4, suffix: "", startFrom: 1 },
  SERVICE_CENTER: { documentType: "SERVICE_CENTER", prefix: "SC", separator: "-", includeFinancialYear: false, includeMonth: false, sequenceLength: 4, suffix: "", startFrom: 1 },
  WAREHOUSE: { documentType: "WAREHOUSE", prefix: "WH", separator: "-", includeFinancialYear: false, includeMonth: false, sequenceLength: 4, suffix: "", startFrom: 1 },
  CALL: { documentType: "CALL", prefix: "CALL", separator: "-", includeFinancialYear: true, includeMonth: false, sequenceLength: 4, suffix: "", startFrom: 1 },
  JOB_SHEET: { documentType: "JOB_SHEET", prefix: "JOB", separator: "-", includeFinancialYear: true, includeMonth: false, sequenceLength: 4, suffix: "", startFrom: 1 },
  MATERIAL: { documentType: "MATERIAL", prefix: "MAT", separator: "-", includeFinancialYear: false, includeMonth: false, sequenceLength: 5, suffix: "", startFrom: 1 },
  NON_GST_INVOICE: { documentType: "NON_GST_INVOICE", prefix: "BILL", separator: "/", includeFinancialYear: true, includeMonth: false, sequenceLength: 4, suffix: "", startFrom: 1 },
  B2B_INVOICE: { documentType: "B2B_INVOICE", prefix: "BINV", separator: "/", includeFinancialYear: true, includeMonth: false, sequenceLength: 4, suffix: "", startFrom: 1 },
  PROFORMA_INVOICE: { documentType: "PROFORMA_INVOICE", prefix: "PI", separator: "/", includeFinancialYear: true, includeMonth: false, sequenceLength: 4, suffix: "", startFrom: 1 },
  ROLE: { documentType: "ROLE", prefix: "ROLE", separator: "-", includeFinancialYear: false, includeMonth: false, sequenceLength: 4, suffix: "", startFrom: 1 },
};

const DOCUMENT_TYPES: DocumentType[] = Object.keys(DEFAULT_CONFIGS) as DocumentType[];

const TEMPLATE_PREVIEW_CONTEXT: Record<string, string> = {
  vendorId: "VND-0001",
  customerId: "CUST-0001",
  businessCode: "BIZ-01",
};

const UNIVERSAL_TOKENS: { token: string; label: string }[] = [
  { token: "{prefix}", label: "Configured prefix" },
  { token: "{fy}", label: "Financial year" },
  { token: "{month}", label: "Month (01-12)" },
  { token: "{year}", label: "Calendar year" },
  { token: "{day}", label: "Day of month" },
  { token: "{seq}", label: "Sequence number" },
  { token: "{suffix}", label: "Configured suffix" },
  { token: "{businessCode}", label: "This business's code" },
  { token: "{businessName}", label: "This business's name" },
];

const TYPE_SPECIFIC_TOKENS: Partial<Record<DocumentType, { token: string; label: string }[]>> = {
  VENDOR_PRODUCT: [{ token: "{vendorId}", label: "This product's vendor code" }],
  INVOICE: [{ token: "{vendorId}", label: "The selling vendor's code (blank for non-vendor sales)" }],
  NON_GST_INVOICE: [{ token: "{vendorId}", label: "The selling vendor's code (blank for non-vendor sales)" }],
  STOCK_ADJUSTMENT: [{ token: "{vendorId}", label: "The adjusting vendor's code (blank for non-vendor adjustments)" }],
  MATERIAL: [{ token: "{vendorId}", label: "The vendor who added this material" }],
  STORE_FRONT: [{ token: "{vendorId}", label: "This vendor's code" }],
  WAREHOUSE: [{ token: "{vendorId}", label: "This vendor's code" }],
};

// Every OTHER document type's own generated number, available as a token
// here too (e.g. {invoiceNumber} in a Credit Note template) -- per explicit
// direction, every type is a valid token everywhere, not just where a
// relationship between the two types actually exists. Most combinations
// have no real relationship, so the generating call site simply won't have
// a value to supply for most of these -- see renderTemplate()'s comment for
// why that renders as "" instead of blocking generation. VENDOR/BUSINESS are
// excluded here since they're already covered by {vendorId}/{businessCode}
// in UNIVERSAL_TOKENS/TYPE_SPECIFIC_TOKENS above.
function crossDocumentTokens(docType: DocumentType): { token: string; label: string }[] {
  return Object.entries(DOCUMENT_NUMBER_TOKENS)
    .filter(([dt]) => dt !== docType)
    .map(([dt, tokenName]) => ({
      token: `{${tokenName}}`,
      label: `${DOCUMENT_TYPE_LABELS[dt as DocumentType] ?? dt} number (only set when this document is generated from/for one)`,
    }));
}

function tokensForDocType(docType: DocumentType): { token: string; label: string }[] {
  return [...UNIVERSAL_TOKENS, ...(TYPE_SPECIFIC_TOKENS[docType] || []), ...crossDocumentTokens(docType)];
}

function buildPreview(config: DocumentConfig): string {
  const { prefix, separator, includeFinancialYear, financialYearFormat, includeMonth, sequenceLength, suffix, startFrom, template } = config;
  const financialYear = financialYearFormat === "compact" ? "2425" : "2024-25";
  const seq = String(startFrom).padStart(sequenceLength, "0");

  if (template && template.trim()) {
    return template.replace(/\{(\w+)\}/g, (match, key: string) => {
      const builtins: Record<string, string> = {
        prefix, fy: financialYear, month: "04", year: "2024", day: "01", seq, suffix,
        businessCode: TEMPLATE_PREVIEW_CONTEXT.businessCode, businessName: "Sample Business",
      };
      if (key in builtins) return builtins[key];
      if (key in TEMPLATE_PREVIEW_CONTEXT) return TEMPLATE_PREVIEW_CONTEXT[key];
      // Matches renderTemplate()'s real runtime behavior (numberingService.ts) --
      // a token nothing supplies a value for renders as "", not literal "{key}".
      return "";
    });
  }

  const parts: string[] = [];
  if (prefix) parts.push(prefix);
  if (includeFinancialYear) parts.push(financialYear);
  if (includeMonth) parts.push("Apr");
  if (suffix) parts.push(suffix);
  parts.push(seq);
  return parts.join(separator);
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (val: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-3 w-full text-left" aria-pressed={checked}>
      <div className={`relative inline-flex w-10 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${checked ? "bg-gray-900" : "bg-gray-200"}`}>
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </div>
      <span className="text-sm text-gray-700">{label}</span>
    </button>
  );
}

function DocumentCard({
  cardState, onChange, onSave, onReset, onToggleOpen,
}: {
  cardState: CardState;
  onChange: (config: DocumentConfig) => void;
  onSave: () => void;
  onReset: () => void;
  onToggleOpen: () => void;
}) {
  const { current, saved, isOpen, isSaving, successMsg, errorMsg } = cardState;
  const docType = current.documentType;
  const label = DOCUMENT_TYPE_LABELS[docType];
  const preview = buildPreview(current);
  // This card's own Save button is the ONLY thing that persists it -- the
  // page's unrelated bottom "Save Changes" button only PATCHes the business
  // form and never touches this config, so an edit left here with the card
  // collapsed (or the page navigated away from) is silently lost. Surfacing
  // "Unsaved" even while collapsed is what makes that discoverable instead
  // of the admin assuming the page-wide save covered it.
  const isDirty = JSON.stringify(current) !== JSON.stringify(saved);
  const separatorOptions = ["-", "/", "."];
  const sequenceLengthOptions = [3, 4, 5, 6];
  const update = (partial: Partial<DocumentConfig>) => onChange({ ...current, ...partial });

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <button type="button" onClick={onToggleOpen} className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-3">
          <span className="text-gray-900 font-medium text-sm">{label}</span>
          <span className="text-xs text-gray-400 font-mono">{docType}</span>
          {isDirty && (
            <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
              Unsaved — click Save below
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!isOpen && <span className="text-xs text-gray-400 font-mono">{preview}</span>}
          <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="px-5 pb-5 border-t border-gray-100">
          <div className="mt-4 mb-5">
            <p className="text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wide">Preview</p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 font-mono text-gray-900 text-sm">{preview}</div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 font-medium mb-1.5">Prefix</label>
                <input type="text" value={current.prefix} onChange={(e) => update({ prefix: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900" placeholder="e.g. INV" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 font-medium mb-1.5">Suffix</label>
                <input type="text" value={current.suffix} onChange={(e) => update({ suffix: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900" placeholder="Optional" />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 font-medium mb-1.5">Separator</label>
              <div className="flex gap-2">
                {separatorOptions.map((sep) => (
                  <button key={sep} type="button" onClick={() => update({ separator: sep })} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${current.separator === sep ? "bg-gray-900 text-white" : "border border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                    {sep}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 font-medium mb-1.5">Sequence Length</label>
              <div className="flex gap-2">
                {sequenceLengthOptions.map((len) => (
                  <button key={len} type="button" onClick={() => update({ sequenceLength: len })} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${current.sequenceLength === len ? "bg-gray-900 text-white" : "border border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                    {len}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 font-medium mb-1.5">Start From</label>
              <input type="number" min={1} value={current.startFrom} onChange={(e) => update({ startFrom: Math.max(1, parseInt(e.target.value, 10) || 1) })} onFocus={(e) => e.target.select()} placeholder="Start from" className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>

            <div className="space-y-3 pt-1">
              <Toggle checked={current.includeFinancialYear} onChange={(val) => update({ includeFinancialYear: val })} label="Include Financial Year (e.g. 2024-25)" />
              {current.includeFinancialYear && (
                <div className="pl-4 flex items-center gap-2">
                  <label className="text-xs text-gray-500">Format:</label>
                  <select value={current.financialYearFormat || "hyphenated"} onChange={(e) => update({ financialYearFormat: e.target.value as "hyphenated" | "compact" })} className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900">
                    <option value="hyphenated">2024-25 (hyphenated)</option>
                    <option value="compact">2425 (compact)</option>
                  </select>
                </div>
              )}
              <Toggle checked={current.includeMonth} onChange={(val) => update({ includeMonth: val })} label="Include Month (e.g. Apr)" />
            </div>

            <div className="pt-3">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-gray-500">Custom Template (optional — overrides everything above)</label>
                <select value="" onChange={(e) => { if (!e.target.value) return; update({ template: (current.template || "") + e.target.value }); }} className="text-[11px] border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
                  <option value="">+ Insert token…</option>
                  {tokensForDocType(docType).map((t) => (
                    <option key={t.token} value={t.token}>{t.token} — {t.label}</option>
                  ))}
                </select>
              </div>
              <input type="text" value={current.template || ""} onChange={(e) => update({ template: e.target.value })} placeholder="e.g. {prefix}-{vendorId}-{fy}-{seq}" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-gray-900" />
              <p className="mt-1.5 text-[11px] text-gray-400 leading-relaxed">
                Use the dropdown above to insert a token, or type your own. A token with no value at generation time will fail loudly rather than produce a wrong number, so test the preview above before saving.
              </p>
            </div>
          </div>

          {successMsg && <div className="mt-4 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{successMsg}</div>}
          {errorMsg && <div className="mt-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{errorMsg}</div>}

          <div className="flex gap-2 mt-5">
            <button type="button" onClick={onSave} disabled={isSaving} className="bg-gray-900 text-white hover:bg-gray-800 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {isSaving ? "Saving..." : "Save"}
            </button>
            <button type="button" onClick={onReset} disabled={isSaving} className="border border-gray-200 text-gray-600 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DocumentNumbersPanel({ businessId }: { businessId: string }) {
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<Record<DocumentType, CardState>>(() => {
    const initial: Partial<Record<DocumentType, CardState>> = {};
    for (const dt of DOCUMENT_TYPES) {
      const def = DEFAULT_CONFIGS[dt];
      initial[dt] = { current: { ...def }, saved: { ...def }, isOpen: false, isSaving: false, successMsg: null, errorMsg: null };
    }
    return initial as Record<DocumentType, CardState>;
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/document-numbers?businessId=${encodeURIComponent(businessId)}`);
        if (res.ok) {
          const data = await res.json();
          const configs: DocumentConfig[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
          if (!cancelled && configs.length > 0) {
            setCards((prev) => {
              const next = { ...prev };
              for (const cfg of configs) {
                const dt = cfg.documentType as DocumentType;
                if (DOCUMENT_TYPES.includes(dt)) {
                  const merged: DocumentConfig = { ...DEFAULT_CONFIGS[dt], ...cfg, documentType: dt };
                  next[dt] = { ...next[dt], current: { ...merged }, saved: { ...merged } };
                }
              }
              return next;
            });
          }
        }
      } catch {
        // keep defaults on error
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [businessId]);

  const handleChange = (docType: DocumentType, config: DocumentConfig) => {
    setCards((prev) => ({ ...prev, [docType]: { ...prev[docType], current: config } }));
  };
  const handleToggleOpen = (docType: DocumentType) => {
    setCards((prev) => ({ ...prev, [docType]: { ...prev[docType], isOpen: !prev[docType].isOpen, successMsg: null, errorMsg: null } }));
  };
  const handleReset = (docType: DocumentType) => {
    setCards((prev) => ({ ...prev, [docType]: { ...prev[docType], current: { ...prev[docType].saved }, successMsg: null, errorMsg: null } }));
  };
  const handleSave = async (docType: DocumentType) => {
    setCards((prev) => ({ ...prev, [docType]: { ...prev[docType], isSaving: true, successMsg: null, errorMsg: null } }));
    const config = cards[docType].current;
    try {
      const res = await fetch("/api/admin/document-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId, documentType: docType, prefix: config.prefix, separator: config.separator,
          includeFinancialYear: config.includeFinancialYear, financialYearFormat: config.financialYearFormat || "hyphenated",
          includeMonth: config.includeMonth, sequenceLength: config.sequenceLength, suffix: config.suffix,
          template: config.template || "", startFrom: config.startFrom,
        }),
      });
      if (res.ok) {
        setCards((prev) => ({ ...prev, [docType]: { ...prev[docType], saved: { ...config }, isSaving: false, successMsg: "Settings saved successfully.", errorMsg: null } }));
      } else {
        let msg = "Failed to save. Please try again.";
        try { const err = await res.json(); if (err?.message) msg = err.message; } catch { /* ignore */ }
        setCards((prev) => ({ ...prev, [docType]: { ...prev[docType], isSaving: false, successMsg: null, errorMsg: msg } }));
      }
    } catch {
      setCards((prev) => ({ ...prev, [docType]: { ...prev[docType], isSaving: false, successMsg: null, errorMsg: "Network error. Please check your connection." } }));
    }
  };

  if (loading) {
    return <p className="text-sm text-gray-400 py-6 text-center">Loading document number settings…</p>;
  }

  return (
    <div className="space-y-3">
      {DOCUMENT_TYPES.map((dt) => (
        <DocumentCard
          key={dt}
          cardState={cards[dt]}
          onChange={(config) => handleChange(dt, config)}
          onSave={() => handleSave(dt)}
          onReset={() => handleReset(dt)}
          onToggleOpen={() => handleToggleOpen(dt)}
        />
      ))}
    </div>
  );
}
