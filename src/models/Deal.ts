/**
 * Deal — a sales-pipeline opportunity. Nothing like this existed before:
 * the "CRM" nav group only covered service-workflow objects (calls,
 * workorders, support tickets), not an actual sales pipeline (the
 * lead-to-close motion every horizontal CRM is built around). Deals link
 * to the existing Customer record (used here as the contact) rather than
 * introducing a separate Contact collection.
 */

import mongoose, { Schema, Model, Document, Types } from "mongoose";

export const DEAL_STAGES = [
  "NEW",
  "QUALIFIED",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
  "LOST",
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

export interface IDeal extends Document {
  businessId?: Types.ObjectId | null;
  title: string;
  customerId?: Types.ObjectId | null;
  companyName?: string;
  value: number;
  currency: string;
  stage: DealStage;
  probability: number;
  expectedCloseDate?: Date | null;
  ownerId?: Types.ObjectId | null;
  source?: string;
  notes?: string;
  lostReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DealSchema = new Schema<IDeal>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", default: null, index: true },
    title: { type: String, required: true, trim: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", default: null, index: true },
    companyName: { type: String, trim: true },
    value: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "INR", trim: true },
    stage: { type: String, enum: DEAL_STAGES, default: "NEW", index: true },
    probability: { type: Number, default: 20, min: 0, max: 100 },
    expectedCloseDate: { type: Date, default: null },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    source: { type: String, trim: true },
    notes: { type: String, trim: true },
    lostReason: { type: String, trim: true },
  },
  { timestamps: true }
);

DealSchema.index({ businessId: 1, stage: 1, createdAt: -1 });
DealSchema.index({ title: "text", companyName: "text" });

const Deal: Model<IDeal> =
  (mongoose.models.Deal as Model<IDeal>) || mongoose.model<IDeal>("Deal", DealSchema);

export default Deal;
