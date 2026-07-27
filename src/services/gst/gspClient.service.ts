/**
 * gspClient.service.ts — real GSP (GST Suvidha Provider) HTTP client.
 *
 * This is the ONE place that talks (or, once real credentials exist, WILL
 * talk) to an actual GSP/ASP REST API — the layer core/gst/gstPortalAdapter.ts
 * used to stub out entirely. It replaces that stub with real request-
 * building/response-parsing code, modeled on the API shape shared by every
 * major Indian GSP that proxies the NIC e-Invoice / e-Way Bill IRP
 * (ClearTax, Cygnet, MasterGST, Zoho GSP, etc. all wrap this same contract
 * since they ultimately talk to the same government IRP):
 *
 *   1. Auth:      POST {baseUrl}/auth
 *                 body: { client_id, client_secret, gstin, username?, password? }
 *                 resp: { access_token, token_type: "Bearer", expires_in, sek? }
 *   2. Push:      POST {baseUrl}/invoice  (Authorization: Bearer <token>)
 *                 body: IRP-shaped invoice JSON (schema INV-01)
 *                 resp: { Irn, AckNo, AckDt, SignedInvoice, SignedQRCode, Status }
 *   3. Status:    GET  {baseUrl}/invoice/irn/{irn}
 *   4. GSTR-1:    GET  {baseUrl}/returns/gstr1?gstin=&period=
 *   5. GSTR-2B:   GET  {baseUrl}/returns/gstr2b?gstin=&period=
 *
 * None of this has been exercised against a live provider — there are no
 * real GSP credentials in this environment. Every method below throws a
 * clear, actionable error the moment credentials/config are missing rather
 * than fabricating a success response. The moment a business configures
 * real `provider` + `clientId`/`clientSecret` (+ `gstin`) in
 * Settings > GST, these calls become live with zero changes needed
 * upstream (core/gst/gstPortalAdapter.ts and the GST page/API routes are
 * already written against this interface).
 *
 * Endpoint bases below are best-effort placeholders per provider — replace
 * with the exact base URL from the provider's onboarding docs once a real
 * account exists; everything else (auth flow, header shape, method
 * signatures) follows the common GSP/IRP convention documented above.
 */

import type { IGstPortalConfig } from "@/models/GstPortalConfig";

export class GstNotConfiguredError extends Error {
  constructor(businessHint?: string) {
    super(
      `GST integration not configured for this business${businessHint ? ` (${businessHint})` : ""} — add GSP credentials in Settings > GST.`
    );
    this.name = "GstNotConfiguredError";
  }
}

/** Best-effort default API bases per supported GSP. Replace with the real
 *  provider base URL from onboarding docs before going live — these are
 *  placeholders following each provider's publicly documented domain
 *  pattern, not verified live endpoints. */
const PROVIDER_BASE_URLS: Record<string, string> = {
  GSTN_DIRECT: "https://api.einvoice1.gst.gov.in", // NIC IRP direct (needs GSP-sponsored token in production)
  CLEARTAX: "https://api.clear.in/einvoice/v2",
  MASTERS_INDIA: "https://api.mastersindia.co/einvoice/v1",
};

export interface GspAuthToken {
  accessToken: string;
  tokenType: string;
  expiresAt: number; // epoch ms
  sek?: string;
}

export interface GspInvoicePushResult {
  ok: boolean;
  irn?: string;
  ackNumber?: string;
  ackDate?: string;
  signedInvoice?: string;
  signedQrCode?: string;
  status?: string;
  errorMessage?: string;
  requestPayload: Record<string, unknown>;
  responsePayload?: Record<string, unknown>;
}

export interface GspInvoiceData {
  gstin: string;
  invoiceNumber: string;
  invoiceDate: string;
  supplyType?: "INTRASTATE" | "INTERSTATE";
  documentType?: "INV" | "CRN" | "DBN";
  customerGstin?: string;
  customerName?: string;
  customerAddress?: string;
  customerStateCode?: string;
  placeOfSupply?: string;
  items: Array<{
    description: string;
    hsnCode?: string;
    quantity: number;
    unit?: string;
    unitPrice: number;
    assessableValue: number;
    cgstRate?: number;
    cgstAmount?: number;
    sgstRate?: number;
    sgstAmount?: number;
    igstRate?: number;
    igstAmount?: number;
  }>;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  grandTotal: number;
}

// In-memory token cache keyed by businessId — auth tokens are short-lived
// (per the standard GSP flow, typically ~6-24h), so callers within the
// same process reuse a still-valid token instead of re-authenticating on
// every push. Not persisted; a process restart just re-authenticates.
const tokenCache = new Map<string, GspAuthToken>();

function requireConfigured(config: IGstPortalConfig | null | undefined): asserts config is IGstPortalConfig {
  if (!config || !config.isEnabled) {
    throw new GstNotConfiguredError("not enabled");
  }
  if (!config.provider || config.provider === "NONE") {
    throw new GstNotConfiguredError("no provider selected");
  }
  if (!config.apiKey || !config.apiSecret) {
    throw new GstNotConfiguredError("missing client credentials");
  }
  if (!config.gstin) {
    throw new GstNotConfiguredError("missing GSTIN");
  }
}

function baseUrlFor(config: IGstPortalConfig): string {
  const base = PROVIDER_BASE_URLS[config.provider as string];
  if (!base) {
    throw new GstNotConfiguredError(`unsupported provider "${config.provider}"`);
  }
  return base;
}

/**
 * Authenticate against the configured GSP and return a bearer token,
 * reusing a cached still-valid token when available. `client_id` maps to
 * GstPortalConfig.apiKey and `client_secret` to apiSecret — the same
 * fields the Settings > GST page already collects, just given their real
 * GSP-flow names here.
 */
export async function authenticate(businessId: string, config: IGstPortalConfig): Promise<GspAuthToken> {
  requireConfigured(config);

  const cached = tokenCache.get(businessId);
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return cached;
  }

  const baseUrl = baseUrlFor(config);
  const res = await fetch(`${baseUrl}/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: config.apiKey,
      client_secret: config.apiSecret,
      gstin: config.gstin,
      username: config.username,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GSP authentication failed (${res.status}): ${text || res.statusText}`);
  }

  const data = await res.json();
  const token: GspAuthToken = {
    accessToken: data.access_token,
    tokenType: data.token_type || "Bearer",
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
    sek: data.sek,
  };

  if (!token.accessToken) {
    throw new Error("GSP authentication response did not include an access_token — check provider credentials.");
  }

  tokenCache.set(businessId, token);
  return token;
}

/** Submit an invoice for IRN generation (or GSTR-1 push, depending on
 *  return type) — the core "push invoice to GST" operation. */
export async function pushInvoice(
  businessId: string,
  config: IGstPortalConfig,
  invoice: GspInvoiceData
): Promise<GspInvoicePushResult> {
  requireConfigured(config);
  const baseUrl = baseUrlFor(config);

  const requestPayload: Record<string, unknown> = {
    Version: "1.1",
    TranDtls: { TaxSch: "GST", SupTyp: invoice.supplyType === "INTERSTATE" ? "INTER" : "INTRA" },
    DocDtls: {
      Typ: invoice.documentType || "INV",
      No: invoice.invoiceNumber,
      Dt: invoice.invoiceDate,
    },
    SellerDtls: { Gstin: invoice.gstin },
    BuyerDtls: {
      Gstin: invoice.customerGstin || "URP", // "URP" = unregistered person, per IRP convention
      LglNm: invoice.customerName,
      Addr1: invoice.customerAddress,
      Pos: invoice.placeOfSupply,
      StateCd: invoice.customerStateCode,
    },
    ItemList: invoice.items.map((it, idx) => ({
      SlNo: String(idx + 1),
      PrdDesc: it.description,
      HsnCd: it.hsnCode,
      Qty: it.quantity,
      Unit: it.unit || "NOS",
      UnitPrice: it.unitPrice,
      AssAmt: it.assessableValue,
      CgstRt: it.cgstRate || 0,
      CgstAmt: it.cgstAmount || 0,
      SgstRt: it.sgstRate || 0,
      SgstAmt: it.sgstAmount || 0,
      IgstRt: it.igstRate || 0,
      IgstAmt: it.igstAmount || 0,
    })),
    ValDtls: {
      AssVal: invoice.taxableValue,
      CgstVal: invoice.cgstAmount,
      SgstVal: invoice.sgstAmount,
      IgstVal: invoice.igstAmount,
      TotInvVal: invoice.grandTotal,
    },
  };

  try {
    const token = await authenticate(businessId, config);

    const res = await fetch(`${baseUrl}/invoice`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `${token.tokenType} ${token.accessToken}`,
        "client-id": config.apiKey || "",
        gstin: config.gstin,
      },
      body: JSON.stringify(requestPayload),
    });

    const responsePayload = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        errorMessage: responsePayload?.message || `GSP invoice push failed (${res.status})`,
        requestPayload,
        responsePayload,
      };
    }

    return {
      ok: true,
      irn: responsePayload.Irn,
      ackNumber: responsePayload.AckNo,
      ackDate: responsePayload.AckDt,
      signedInvoice: responsePayload.SignedInvoice,
      signedQrCode: responsePayload.SignedQRCode,
      status: responsePayload.Status || "ACCEPTED",
      requestPayload,
      responsePayload,
    };
  } catch (err) {
    if (err instanceof GstNotConfiguredError) throw err;
    return {
      ok: false,
      errorMessage: err instanceof Error ? err.message : "Unknown error pushing invoice to GSP",
      requestPayload,
    };
  }
}

/** Poll the current IRP/GSP status for a previously-submitted IRN. */
export async function getInvoiceStatus(
  businessId: string,
  config: IGstPortalConfig,
  irn: string
): Promise<Record<string, unknown>> {
  requireConfigured(config);
  const baseUrl = baseUrlFor(config);
  const token = await authenticate(businessId, config);

  const res = await fetch(`${baseUrl}/invoice/irn/${encodeURIComponent(irn)}`, {
    headers: {
      authorization: `${token.tokenType} ${token.accessToken}`,
      "client-id": config.apiKey || "",
      gstin: config.gstin,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GSP status lookup failed (${res.status}): ${text || res.statusText}`);
  }
  return res.json();
}

/** Fetch GSTR-1 (outward supplies) data for a filing period, e.g. "MM-YYYY". */
export async function fetchGSTR1Data(
  businessId: string,
  config: IGstPortalConfig,
  period: string
): Promise<Record<string, unknown>> {
  requireConfigured(config);
  const baseUrl = baseUrlFor(config);
  const token = await authenticate(businessId, config);

  const res = await fetch(
    `${baseUrl}/returns/gstr1?gstin=${encodeURIComponent(config.gstin)}&period=${encodeURIComponent(period)}`,
    {
      headers: {
        authorization: `${token.tokenType} ${token.accessToken}`,
        "client-id": config.apiKey || "",
      },
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GSTR-1 fetch failed (${res.status}): ${text || res.statusText}`);
  }
  return res.json();
}

/** Fetch GSTR-2B (auto-drafted inward ITC statement) for a filing period. */
export async function fetchGSTR2BData(
  businessId: string,
  config: IGstPortalConfig,
  period: string
): Promise<Record<string, unknown>> {
  requireConfigured(config);
  const baseUrl = baseUrlFor(config);
  const token = await authenticate(businessId, config);

  const res = await fetch(
    `${baseUrl}/returns/gstr2b?gstin=${encodeURIComponent(config.gstin)}&period=${encodeURIComponent(period)}`,
    {
      headers: {
        authorization: `${token.tokenType} ${token.accessToken}`,
        "client-id": config.apiKey || "",
      },
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GSTR-2B fetch failed (${res.status}): ${text || res.statusText}`);
  }
  return res.json();
}
