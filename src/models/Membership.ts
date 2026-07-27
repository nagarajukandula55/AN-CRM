/**
 * @deprecated Membership is deprecated and has no active API routes or imports.
 *
 * The canonical model for business membership is BusinessMember (src/models/BusinessMember.ts),
 * which is actively used. BusinessMember tracks which users belong to which business,
 * along with their role and permissions within that business.
 *
 * This file is kept for backwards compatibility only. Do NOT add new code here.
 * For new membership/access functionality, import from:
 *   import BusinessMember from "@/models/BusinessMember";
 */

import mongoose, { Schema, Model, Document } from "mongoose";

/** @deprecated Use BusinessMember instead */
export interface IMembership extends Document {
  userId: mongoose.Types.ObjectId;
  businessId: mongoose.Types.ObjectId;
  plan?: string;
  role?: string;
  status: "ACTIVE" | "INACTIVE" | "PENDING" | "SUSPENDED";
  startDate?: Date;
  endDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** @deprecated Use BusinessMember instead */
const MembershipSchema = new Schema<IMembership>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
    businessId: { type: Schema.Types.ObjectId, required: true, ref: "Business" },
    plan: { type: String },
    role: { type: String, default: "member" },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "PENDING", "SUSPENDED"],
      default: "ACTIVE",
    },
    startDate: { type: Date },
    endDate: { type: Date },
  },
  { timestamps: true }
);

/** @deprecated Use BusinessMember instead */
const Membership: Model<IMembership> =
  (mongoose.models.Membership as Model<IMembership>) ||
  mongoose.model<IMembership>("Membership", MembershipSchema);

export default Membership;
