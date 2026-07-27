/**
 * GST portal push adapter — the ONE place this codebase talks to an
 * external GSP/ASP (GST Suvidha Provider) API to actually file an invoice
 * against the government GST portal.
 *
 * Previously a stub that faked a "submitted" response regardless of
 * whether any real provider was configured. Now wired to the real HTTP
 * client in services/gst/gspClient.service.ts (auth + invoice push,
 * modeled on the common ClearTax/Cygnet/Masters India/NIC-IRP request
 * shape — see that file's top comment for the exact API contract assumed).
 * There are no live GSP credentials in this environment to test against,
 * so this has not been exercised against a real provider — but it no
 * longer pretends to succeed: `gspClient` throws a clear
 * "GST integration not configured..." error whenever a business hasn't
 * added real credentials, and that error is surfaced here as a FAILED
 * result rather than swallowed.
 *
 * This mirrors core/anu/anuService.ts's own pattern: business logic and
 * callers are written against a stable interface; only this file (and the
 * client it wraps) changes when the real upstream integration goes live.
 */

import type { IGstPortalConfig } from "@/models/GstPortalConfig";
import { pushInvoice, GstNotConfiguredError, type GspInvoiceData } from "@/services/gst/gspClient.service";

export interface GstPushRequest {
  businessId: string;
  gstin: string;
  returnType: "GSTR1" | "GSTR3B" | "IFF";
  period: string;
  invoiceNumber: string;
  invoiceDate: string;
  supplyType?: "INTRASTATE" | "INTERSTATE";
  customerGstin?: string;
  customerName?: string;
  customerAddress?: string;
  customerStateCode?: string;
  placeOfSupply?: string;
  items?: GspInvoiceData["items"];
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  grandTotal: number;
}

export interface GstPushResult {
  ok: boolean;
  status: "SUBMITTED" | "FAILED";
  portalReferenceId?: string;
  irn?: string;
  ackNumber?: string;
  ackDate?: string;
  signedQrCode?: string;
  errorMessage?: string;
  /** Exact payload sent — persisted on GstFiling for audit/debugging regardless of outcome */
  requestPayload: Record<string, unknown>;
  responsePayload?: Record<string, unknown>;
}

export async function pushToPortal(
  config: IGstPortalConfig,
  request: GstPushRequest
): Promise<GstPushResult> {
  const requestPayload = { ...request } as Record<string, unknown>;

  if (!config.isEnabled) {
    return {
      ok: false,
      status: "FAILED",
      errorMessage: "GST portal integration is not enabled for this business. Configure it in Settings > GST Filing.",
      requestPayload,
    };
  }

  if (!config.provider || config.provider === "NONE") {
    return {
      ok: false,
      status: "FAILED",
      errorMessage: "No GST filing provider configured. Choose a provider (GSTN Direct / ClearTax / Masters India) in Settings > GST Filing.",
      requestPayload,
    };
  }

  if (!config.apiKey || !config.apiSecret) {
    return {
      ok: false,
      status: "FAILED",
      errorMessage: "GST provider client credentials are missing. Add API Key/Secret in Settings > GST Filing before pushing invoices.",
      requestPayload,
    };
  }

  // ── Real integration point ──────────────────────────────────────────
  // Delegates to services/gst/gspClient.service.ts, which builds and sends
  // the actual HTTP request to the configured GSP. That call has not been
  // exercised against a live provider (no real credentials in this
  // environment) but is real request-building/response-parsing code, not a
  // simulated success — if the provider rejects the call, or credentials
  // are wrong, this surfaces as a FAILED result with the real error.
  try {
    const result = await pushInvoice(request.businessId, config, {
      gstin: request.gstin,
      invoiceNumber: request.invoiceNumber,
      invoiceDate: request.invoiceDate,
      supplyType: request.supplyType,
      customerGstin: request.customerGstin,
      customerName: request.customerName,
      customerAddress: request.customerAddress,
      customerStateCode: request.customerStateCode,
      placeOfSupply: request.placeOfSupply,
      items: request.items || [],
      taxableValue: request.taxableValue,
      cgstAmount: request.cgstAmount,
      sgstAmount: request.sgstAmount,
      igstAmount: request.igstAmount,
      grandTotal: request.grandTotal,
    });

    if (!result.ok) {
      return {
        ok: false,
        status: "FAILED",
        errorMessage: result.errorMessage || "GSP invoice push failed",
        requestPayload: result.requestPayload,
        responsePayload: result.responsePayload,
      };
    }

    return {
      ok: true,
      status: "SUBMITTED",
      portalReferenceId: result.irn,
      irn: result.irn,
      ackNumber: result.ackNumber,
      ackDate: result.ackDate,
      signedQrCode: result.signedQrCode,
      requestPayload: result.requestPayload,
      responsePayload: result.responsePayload,
    };
  } catch (err) {
    if (err instanceof GstNotConfiguredError) {
      return {
        ok: false,
        status: "FAILED",
        errorMessage: err.message,
        requestPayload,
      };
    }
    return {
      ok: false,
      status: "FAILED",
      errorMessage: err instanceof Error ? err.message : "Unknown error pushing invoice to GST portal",
      requestPayload,
    };
  }
}
