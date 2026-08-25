import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Admin-defined, reusable vendor billing plan (e.g. "Basic", "Pro") -- a
 * fixed module bundle at a fixed total price, so a vendor can self-serve
 * "pick a plan, pay, get activated" instead of an admin hand-picking
 * modules and typing a rate per vendor every time (see
 * console/admin/vendor-billing/[vendorId]/page.tsx for that older,
 * still-supported ad-hoc path -- this is a parallel, not a replacement).
 * One flat `price` per plan (not per-module rates) -- see billing.service.ts
 * comment on why VendorSubscription.modules still carries a rate per
 * module (real per-module access-gating in vendorAccess.service.ts reads
 * modules[].key, so the module list itself must stay real; the rate on
 * each is just this total split evenly for invoice line items).
 * Single vendor type (SC) today -- no per-type plan scoping.
 */
export interface IVendorPlan extends Document {
  name: string;
  description: string;
  moduleKeys: string[];
  price: number;
  validityDays: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const VendorPlanSchema = new Schema<IVendorPlan>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    moduleKeys: [{ type: String }],
    price: { type: Number, required: true, min: 0 },
    validityDays: { type: Number, required: true, default: 30 },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

VendorPlanSchema.index({ isActive: 1, sortOrder: 1 });

const VendorPlan: Model<IVendorPlan> =
  mongoose.models.VendorPlan || mongoose.model<IVendorPlan>("VendorPlan", VendorPlanSchema);

export default VendorPlan;
