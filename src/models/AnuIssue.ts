/**
 * AnuIssue — problems and reports raised *through ANu* (the assistant chat
 * widget on any property: this admin panel, native's storefront, or any
 * future site) that need a human to look at and act on. Distinct from
 * Feedback (general "contact us" correspondence with no AI involvement) and
 * from AnuInteractionLog (raw question/answer history, not actionable) --
 * this is specifically the queue an admin works from.
 */

import mongoose, { Schema, Model, Document } from "mongoose";

export type AnuIssueStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED";
export type AnuIssueSeverity = "LOW" | "MEDIUM" | "HIGH";

export interface IAnuIssue extends Document {
  businessId: mongoose.Types.ObjectId;
  reporterId?: mongoose.Types.ObjectId;
  reporterEmail?: string;
  source: string;
  title: string;
  description: string;
  severity: AnuIssueSeverity;
  status: AnuIssueStatus;
  resolutionNotes?: string;
  resolvedBy?: mongoose.Types.ObjectId;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AnuIssueSchema = new Schema<IAnuIssue>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    reporterId: { type: Schema.Types.ObjectId, ref: "User" },
    reporterEmail: { type: String, trim: true, lowercase: true },
    source: { type: String, required: true, default: "anu-widget" },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    severity: { type: String, enum: ["LOW", "MEDIUM", "HIGH"], default: "MEDIUM" },
    status: { type: String, enum: ["OPEN", "IN_PROGRESS", "RESOLVED"], default: "OPEN", index: true },
    resolutionNotes: { type: String, trim: true },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

AnuIssueSchema.index({ businessId: 1, status: 1, createdAt: -1 });

const AnuIssue: Model<IAnuIssue> =
  (mongoose.models.AnuIssue as Model<IAnuIssue>) || mongoose.model<IAnuIssue>("AnuIssue", AnuIssueSchema);

export default AnuIssue;
