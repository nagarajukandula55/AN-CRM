/**
 * SymptomCode — separate master list from FaultCode, used specifically in
 * the repair flow (JobSheet) to record the observed symptom distinct from
 * the underlying fault (e.g. symptom "Device not switching on" vs fault
 * "SMPS failure" once diagnosed). Same businessId-scoped pattern as
 * FaultCode, including the null-businessId platform-seeded fallback.
 */

import mongoose, { Schema, Model, Document, Types } from "mongoose";
import { BUSINESS_SCOPES, type BusinessScope } from "@/core/catalog/businessScope";
import { DEVICE_CATEGORIES, type DeviceCategory } from "@/core/catalog/deviceCategory";

export interface ISymptomCode extends Document {
  businessId?: Types.ObjectId | null;
  businessScope: BusinessScope;
  businessIds: Types.ObjectId[];
  code: string;
  description: string;
  // Same "Device Type > Component Category > Symptom Code" tree as
  // FaultCode -- see that model's matching fields for the full rationale.
  deviceCategory?: DeviceCategory | null;
  category?: string;
  parentId?: Types.ObjectId | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SymptomCodeSchema = new Schema<ISymptomCode>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", default: null, index: true },
    businessScope: { type: String, enum: BUSINESS_SCOPES, default: "SINGLE" },
    businessIds: [{ type: Schema.Types.ObjectId, ref: "Business" }],
    code: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    deviceCategory: { type: String, enum: DEVICE_CATEGORIES, default: null },
    category: { type: String, trim: true },
    parentId: { type: Schema.Types.ObjectId, ref: "SymptomCode", default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

SymptomCodeSchema.index({ businessId: 1, isActive: 1 });
SymptomCodeSchema.index({ businessId: 1, code: 1 }, { unique: true });
SymptomCodeSchema.index({ businessId: 1, deviceCategory: 1, category: 1 });

const SymptomCode: Model<ISymptomCode> =
  (mongoose.models.SymptomCode as Model<ISymptomCode>) ||
  mongoose.model<ISymptomCode>("SymptomCode", SymptomCodeSchema);

export default SymptomCode;

export const DEFAULT_SYMPTOM_CODES: Array<Pick<ISymptomCode, "code" | "description" | "category">> = [
  { code: "SY-001", description: "Device does not power on", category: "General" },
  { code: "SY-002", description: "Blank / black screen", category: "Display" },
  { code: "SY-003", description: "Intermittent power loss", category: "General" },
  { code: "SY-004", description: "Unusual noise during operation", category: "General" },
  { code: "SY-005", description: "Overheats after short use", category: "General" },
  { code: "SY-006", description: "Slow performance / lag", category: "Software" },
  { code: "SY-007", description: "Frequent restarts", category: "Software" },
  { code: "SY-008", description: "No audio output", category: "Audio" },
  { code: "SY-009", description: "Distorted audio output", category: "Audio" },
  { code: "SY-010", description: "Screen flickers intermittently", category: "Display" },
  { code: "SY-011", description: "Does not charge / charges slowly", category: "Battery" },
  { code: "SY-012", description: "Battery drains unusually fast", category: "Battery" },
  { code: "SY-013", description: "Physical damage visible", category: "General" },
  { code: "SY-014", description: "Liquid exposure suspected", category: "General" },
  { code: "SY-015", description: "Connectivity drops intermittently", category: "Network" },
];
