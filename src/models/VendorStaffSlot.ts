import mongoose, { Schema, Model, Document, Types } from "mongoose";

/**
 * VendorStaffSlot — an unfilled staff seat, auto-created (INACTIVE) the
 * moment a vendor goes live, one per standard designation. A real
 * BusinessMember can't represent this (its userId is required -- there's
 * no user yet). Super Admin later "tags a user ID" to a slot, which
 * creates the real User+BusinessMember and marks the slot ACTIVE.
 */
export type VendorDesignation = "MANAGER" | "CCO" | "ENGINEER" | "WAREHOUSE_MANAGER" | "TELECALLER";

export const VENDOR_DESIGNATIONS: VendorDesignation[] = [
  "MANAGER",
  "CCO",
  "ENGINEER",
  "WAREHOUSE_MANAGER",
  "TELECALLER",
];

export interface IVendorStaffSlot extends Document {
  businessId: Types.ObjectId;
  vendorId: Types.ObjectId;
  designation: VendorDesignation;
  status: "INACTIVE" | "ACTIVE";
  userId?: Types.ObjectId; // set once Super Admin tags a user, status -> ACTIVE
  activatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const VendorStaffSlotSchema = new Schema<IVendorStaffSlot>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "VendorProfile", required: true, index: true },
    designation: { type: String, enum: VENDOR_DESIGNATIONS, required: true },
    status: { type: String, enum: ["INACTIVE", "ACTIVE"], default: "INACTIVE", index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    activatedAt: { type: Date },
  },
  { timestamps: true }
);

VendorStaffSlotSchema.index({ vendorId: 1, designation: 1 }, { unique: true });

const VendorStaffSlot: Model<IVendorStaffSlot> =
  (mongoose.models.VendorStaffSlot as Model<IVendorStaffSlot>) ||
  mongoose.model<IVendorStaffSlot>("VendorStaffSlot", VendorStaffSlotSchema);

export default VendorStaffSlot;
