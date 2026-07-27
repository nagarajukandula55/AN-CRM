/**
 * GstFiling — one record per invoice-to-GST-portal filing attempt.
 *
 * Built per explicit user request: "push our bills to gst portal directly
 * and also our assistant should assist with all the processes and
 * pendings." This model is the audit trail / status tracker for that —
 * one row per SalesInvoice per filing attempt, independent of whether the
 * actual portal push succeeded, so admins (and ANu) always have something
 * concrete to look at for "what's pending."
 *
 * Deliberately NOT storing GST portal credentials here — those live on
 * GstPortalConfig (per-business, one row, same shape convention as
 * AIConfig.ts) so credential storage is centralized and auditable the same
 * way AI provider keys already are.
 */

import mongoose, { Schema, Model, Document } from "mongoose";

export type GstFilingStatus =
  | "PENDING"      // queued, not yet pushed to the portal
  | "SUBMITTED"    // pushed, portal has acknowledged receipt
  | "ACCEPTED"     // portal validated and accepted the filing
  | "REJECTED"     // portal rejected — see rejectionReason
  | "FAILED";      // our own push attempt failed before reaching the portal (network/auth/etc.)

export type GstReturnType = "GSTR1" | "GSTR3B" | "IFF";

export interface IGstFiling extends Document {
  businessId: mongoose.Types.ObjectId;
  invoiceId: mongoose.Types.ObjectId; // SalesInvoice._id
  invoiceNumber: string;
  returnType: GstReturnType;
  /** Which GST filing period this belongs to, e.g. "2026-06" (month) or "Q1-2026" */
  period: string;
  status: GstFilingStatus;
  /** Portal's own reference/ack number once submitted, if any */
  portalReferenceId?: string;
  rejectionReason?: string;
  submittedAt?: Date;
  resolvedAt?: Date;
  /** Raw request/response payloads for debugging — never shown to end users, admin/audit only */
  lastRequestPayload?: Record<string, unknown>;
  lastResponsePayload?: Record<string, unknown>;
  submittedBy?: string; // userId string, matches StockAdjustment.adjustedBy convention
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const GstFilingSchema = new Schema<IGstFiling>(
  {
    businessId: { type: Schema.Types.ObjectId, required: true, index: true },
    invoiceId: { type: Schema.Types.ObjectId, required: true, ref: "SalesInvoice", index: true },
    invoiceNumber: { type: String, required: true },
    returnType: { type: String, enum: ["GSTR1", "GSTR3B", "IFF"], required: true },
    period: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["PENDING", "SUBMITTED", "ACCEPTED", "REJECTED", "FAILED"],
      default: "PENDING",
      index: true,
    },
    portalReferenceId: { type: String },
    rejectionReason: { type: String },
    submittedAt: { type: Date },
    resolvedAt: { type: Date },
    lastRequestPayload: { type: Schema.Types.Mixed },
    lastResponsePayload: { type: Schema.Types.Mixed },
    submittedBy: { type: String },
    notes: { type: String },
  },
  { timestamps: true }
);

// Admin dashboard's hot path: "show me everything pending for this business"
GstFilingSchema.index({ businessId: 1, status: 1, createdAt: -1 });

const GstFiling: Model<IGstFiling> =
  (mongoose.models.GstFiling as Model<IGstFiling>) ||
  mongoose.model<IGstFiling>("GstFiling", GstFilingSchema);

export default GstFiling;
