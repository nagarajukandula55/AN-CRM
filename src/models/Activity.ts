/**
 * Activity — a note/call/email/meeting/task logged against a Deal. Every
 * CRM needs a timeline + follow-up reminders on a deal; nothing like this
 * existed before Deal itself did (see models/Deal.ts's own top comment).
 * Kept generic (`dealId` today) rather than deal-only in the type name so
 * it can be pointed at other entities later without a rename.
 */

import mongoose, { Schema, Model, Document, Types } from "mongoose";

export const ACTIVITY_TYPES = ["NOTE", "CALL", "EMAIL", "MEETING", "TASK"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface IActivity extends Document {
  businessId?: Types.ObjectId | null;
  dealId: Types.ObjectId;
  type: ActivityType;
  description: string;
  dueDate?: Date | null;
  completed: boolean;
  completedAt?: Date | null;
  createdBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const ActivitySchema = new Schema<IActivity>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", default: null, index: true },
    dealId: { type: Schema.Types.ObjectId, ref: "Deal", required: true, index: true },
    type: { type: String, enum: ACTIVITY_TYPES, default: "NOTE" },
    description: { type: String, required: true, trim: true },
    dueDate: { type: Date, default: null },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

ActivitySchema.index({ dealId: 1, createdAt: -1 });

const Activity: Model<IActivity> =
  (mongoose.models.Activity as Model<IActivity>) || mongoose.model<IActivity>("Activity", ActivitySchema);

export default Activity;
