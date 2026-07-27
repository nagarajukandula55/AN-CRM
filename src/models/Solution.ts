/**
 * Solution — master list of standard repair/resolution descriptions used on
 * CrmJobSheet ("Work Performed"), so technicians pick from a standard list
 * instead of retyping free text each time. Same conventions as FaultCode.ts:
 * businessId-scoped with a null businessId meaning a global (platform-
 * seeded) solution visible to every business, plus the shared business-
 * tagging tri-state (see core/catalog/businessScope.ts) for sharing a
 * business-specific solution with other businesses.
 */

import mongoose, { Schema, Model, Document, Types } from "mongoose";
import { BUSINESS_SCOPES, type BusinessScope } from "@/core/catalog/businessScope";

export interface ISolution extends Document {
  businessId?: Types.ObjectId | null;
  businessScope: BusinessScope;
  businessIds: Types.ObjectId[];
  code: string;
  description: string;
  category?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SolutionSchema = new Schema<ISolution>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", default: null, index: true },
    businessScope: { type: String, enum: BUSINESS_SCOPES, default: "SINGLE" },
    businessIds: [{ type: Schema.Types.ObjectId, ref: "Business" }],
    code: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    category: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

SolutionSchema.index({ businessId: 1, isActive: 1 });
SolutionSchema.index({ businessId: 1, code: 1 }, { unique: true });

const Solution: Model<ISolution> =
  (mongoose.models.Solution as Model<ISolution>) ||
  mongoose.model<ISolution>("Solution", SolutionSchema);

export default Solution;
