import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * ModuleRecord — a single data row belonging to a ModuleDefinition.
 *
 * IMPORTANT ARCHITECTURAL NOTE (read before extending this):
 * This flexible-document model is ONLY meant for ADMIN-DEFINED CUSTOM
 * modules (ModuleDefinition.isSystem === false) — the "invent a new module
 * from the UI" capability. It is intentionally schema-less at the Mongoose
 * level because a custom module's shape isn't known until an admin defines
 * it, and application-layer validation (see validateRecord.ts) enforces the
 * ModuleDefinition's field rules instead.
 *
 * Built-in system modules (inventory, sales, invoices, etc.) MUST continue
 * to use real, specific Mongoose models with real schemas — the ones in
 * src/modules/<domain>/models/. Do NOT migrate existing well-typed models
 * into this generic ModuleRecord store "for consistency." Real schemas catch
 * real bugs at write time (wrong types, missing required fields at the DB
 * layer as a second line of defense); a flexible document store does not,
 * and moving proven business-critical data (invoices, stock, orders) into a
 * schema-less collection would be a strict regression in safety for no
 * benefit — the whole point of Option B being rejected in favor of Option A
 * was to add configurability for NEW admin-invented concepts, not to
 * degrade the reliability of what already works.
 */

export interface IModuleRecord extends Document {
  moduleKey: string;
  businessId: mongoose.Types.ObjectId;
  data: Record<string, unknown>;
  isDeleted: boolean;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ModuleRecordSchema = new Schema<IModuleRecord>(
  {
    moduleKey: { type: String, required: true, index: true },
    businessId: {
      type: Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    data: { type: Schema.Types.Mixed, required: true, default: {} },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

ModuleRecordSchema.index({ businessId: 1, moduleKey: 1, isDeleted: 1 });

const ModuleRecord: Model<IModuleRecord> =
  (mongoose.models.ModuleRecord as Model<IModuleRecord>) ||
  mongoose.model<IModuleRecord>("ModuleRecord", ModuleRecordSchema);

export default ModuleRecord;
