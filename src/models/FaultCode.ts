/**
 * FaultCode — master list of common device fault/VOC (voice-of-customer)
 * descriptions used on CrmJobSheet ("Issue in device / VOC" field), so
 * technicians pick from a standard list instead of retyping free text each
 * time. businessId-scoped like Brand; a null businessId means a global
 * (platform-seeded) fault code visible to every business, same pattern as
 * other master-data models that fall back to a shared default set.
 */

import mongoose, { Schema, Model, Document, Types } from "mongoose";
import { BUSINESS_SCOPES, type BusinessScope } from "@/core/catalog/businessScope";
import { DEVICE_CATEGORIES, type DeviceCategory } from "@/core/catalog/deviceCategory";

export interface IFaultCode extends Document {
  businessId?: Types.ObjectId | null;
  businessScope: BusinessScope;
  businessIds: Types.ObjectId[];
  code: string;
  description: string;
  // Device type this fault code applies to (Mobile, Laptop, TV, ...) -- the
  // outer level of the "Device Type > Component Category > Fault Code" tree.
  // Optional so existing/default codes (created before this field existed,
  // or genuinely cross-device like "General service") fall into an
  // "Uncategorized" bucket in the UI rather than failing to render.
  deviceCategory?: DeviceCategory | null;
  // Component grouping within a device type (e.g. "Screen"/"Battery") --
  // the middle level of the tree. Pre-existing field, now documented as
  // this role rather than a generic free-text tag.
  category?: string;
  // Optional parent fault code -- same self-referencing tree pattern as
  // Brand/ProductCategory/MaterialCategory, so fault codes can be grouped
  // (e.g. "Display" > "Cracked screen") and browsed/edited as a tree.
  parentId?: Types.ObjectId | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FaultCodeSchema = new Schema<IFaultCode>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", default: null, index: true },
    businessScope: { type: String, enum: BUSINESS_SCOPES, default: "SINGLE" },
    businessIds: [{ type: Schema.Types.ObjectId, ref: "Business" }],
    code: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    deviceCategory: { type: String, enum: DEVICE_CATEGORIES, default: null },
    category: { type: String, trim: true },
    parentId: { type: Schema.Types.ObjectId, ref: "FaultCode", default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

FaultCodeSchema.index({ businessId: 1, isActive: 1 });
FaultCodeSchema.index({ businessId: 1, code: 1 }, { unique: true });
FaultCodeSchema.index({ businessId: 1, deviceCategory: 1, category: 1 });

const FaultCode: Model<IFaultCode> =
  (mongoose.models.FaultCode as Model<IFaultCode>) ||
  mongoose.model<IFaultCode>("FaultCode", FaultCodeSchema);

export default FaultCode;

/**
 * Starter list of ~28 common Indian consumer-electronics fault
 * codes/descriptions spanning Mobile/TV/Electronics/Electricals. Used to
 * auto-seed a business's fault-code list the first time GET /api/fault-codes
 * is called and no codes exist yet for that business (or globally).
 * NOTE: this is a reasonable starting point, not an exhaustive taxonomy —
 * business owners should review/extend via the admin UI.
 */
export const DEFAULT_FAULT_CODES: Array<Pick<IFaultCode, "code" | "description" | "category">> = [
  { code: "FC-001", description: "Screen not turning on / no display", category: "Display" },
  { code: "FC-002", description: "Cracked / physically damaged screen", category: "Display" },
  { code: "FC-003", description: "Touch screen not responding", category: "Display" },
  { code: "FC-004", description: "Display flickering / lines on screen", category: "Display" },
  { code: "FC-005", description: "Battery draining fast", category: "Battery" },
  { code: "FC-006", description: "Battery not charging", category: "Battery" },
  { code: "FC-007", description: "Battery swelling", category: "Battery" },
  { code: "FC-008", description: "Charging port loose / not detecting charger", category: "Charging" },
  { code: "FC-009", description: "Device overheating", category: "General" },
  { code: "FC-010", description: "Device not switching on (dead)", category: "General" },
  { code: "FC-011", description: "Device hangs / restarts automatically", category: "Software" },
  { code: "FC-012", description: "Software update failed", category: "Software" },
  { code: "FC-013", description: "Virus / malware issue", category: "Software" },
  { code: "FC-014", description: "Water damage", category: "General" },
  { code: "FC-015", description: "No sound / speaker not working", category: "Audio" },
  { code: "FC-016", description: "Microphone not working", category: "Audio" },
  { code: "FC-017", description: "Camera not working", category: "Camera" },
  { code: "FC-018", description: "Camera image blurry / focus issue", category: "Camera" },
  { code: "FC-019", description: "Network / signal issue", category: "Network" },
  { code: "FC-020", description: "Wi-Fi not connecting", category: "Network" },
  { code: "FC-021", description: "Bluetooth not working", category: "Network" },
  { code: "FC-022", description: "Physical damage - body/casing", category: "General" },
  { code: "FC-023", description: "Button(s) not working (power/volume/home)", category: "General" },
  { code: "FC-024", description: "No picture but has sound (TV)", category: "Display" },
  { code: "FC-025", description: "Remote control not working", category: "Accessory" },
  { code: "FC-026", description: "Power supply / SMPS failure", category: "Electricals" },
  { code: "FC-027", description: "Short circuit / tripping", category: "Electricals" },
  { code: "FC-028", description: "Motor / compressor not running", category: "Electronics" },
  { code: "FC-029", description: "Fan / cooling not working", category: "Electronics" },
  { code: "FC-030", description: "General service / preventive maintenance", category: "General" },
];
