import mongoose, { Schema, Model, Document } from "mongoose";
import { BUSINESS_SCOPES, type BusinessScope } from "@/core/catalog/businessScope";
import { DEVICE_CATEGORIES, type DeviceCategory } from "@/core/catalog/deviceCategory";

export interface IBrand extends Document {
  name: string;
  description?: string;
  // Electronics device type this brand belongs to (Mobile, Laptop, TV, ...)
  // -- optional so every pre-existing Brand doc (created before this field
  // existed) stays valid; the admin UI shows uncategorized brands as their
  // own root nodes rather than failing to render. IS part of the uniqueness
  // below (see that index) -- a true multi-line brand (Samsung sells phones,
  // TVs, fridges, ACs, ...) genuinely needs one row per category it's
  // classified under, each with its own category-appropriate DeviceModel
  // list, rather than one row lumping every product line's models together
  // under a single arbitrary category.
  category?: DeviceCategory | null;
  // Which of this business's storefront ProductCategory nodes this brand
  // sells under -- a DIFFERENT, unrelated taxonomy from `category` above
  // (DeviceCategory is the CRM/repair device-type grouping; ProductCategory
  // is the storefront/catalog taxonomy a business defines for itself, e.g.
  // "Mobile Phones", "Cold Pressed Oils"). Vendor product creation
  // (StepBasicInfo.tsx) picks a ProductCategory first, then this narrows
  // the Brand list to only brands actually tagged under it -- previously
  // Category and Brand were two fully independent, unfiltered dropdowns
  // with no relationship at all, so e.g. every electronics brand still
  // showed up under an unrelated grocery category and vice versa.
  productCategoryId?: mongoose.Types.ObjectId | null;
  // Optional parent brand -- lets a business branch brands the same way
  // ProductCategory/MaterialCategory already do (e.g. a "Mobile" group
  // with its own set of logo entries under it, a separate "Laptops"
  // group with its own). Self-referencing, same pattern as
  // ProductCategory.parentId.
  parentId?: mongoose.Types.ObjectId | null;
  businessId: mongoose.Types.ObjectId;
  // Business tagging: SINGLE (default) = businessId only, MULTIPLE = also
  // visible to every business in businessIds, ALL = visible everywhere.
  // See core/catalog/businessScopeFilter.ts for the query this backs.
  businessScope: BusinessScope;
  businessIds: mongoose.Types.ObjectId[];
  // Owning vendor (VendorProfile._id), null for a shared platform default
  // (added by business-wide staff, not any one vendor). Every self-signed-
  // up vendor shares ONE platform Business (see VendorProfile's own
  // comment on why telegram fields/terms moved off Business), so without
  // this a Brand one vendor adds -- and every DeviceModel/BOM part filed
  // under it -- would show up as a suggestion for every OTHER vendor
  // sharing that Business too. Same private-list-with-shared-default
  // pattern as Solutions/FaultCodes/BOM.
  vendorId?: mongoose.Types.ObjectId | null;
  logoUrl?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BrandSchema = new Schema<IBrand>(
  {
    name: { type: String, required: true },
    description: { type: String },
    category: { type: String, enum: DEVICE_CATEGORIES, default: null },
    productCategoryId: { type: Schema.Types.ObjectId, ref: "ProductCategory", default: null },
    parentId: { type: Schema.Types.ObjectId, ref: "Brand", default: null },
    businessId: { type: Schema.Types.ObjectId, required: true },
    businessScope: { type: String, enum: BUSINESS_SCOPES, default: "SINGLE" },
    businessIds: [{ type: Schema.Types.ObjectId, ref: "Business" }],
    vendorId: { type: Schema.Types.ObjectId, ref: "VendorProfile", default: null, index: true },
    logoUrl: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

BrandSchema.index({ businessId: 1, isActive: 1 });
BrandSchema.index({ businessId: 1, productCategoryId: 1 });
// Covers the CRM creation forms' Brand dropdown query shape
// (GET /api/brands?businessId&category, defaults to isActive:true) --
// previously only { businessId, isActive } and { businessId,
// productCategoryId } existed, neither of which covers a category filter.
BrandSchema.index({ businessId: 1, category: 1, isActive: 1 });
// A brand name is unique per (business, vendor, category) -- vendor added
// so two different vendors sharing one Business can each have their own
// "Samsung" row (see vendorId's own comment above); previously per
// (business, category) alone, which meant the SECOND vendor to ever add
// a given brand name hit a duplicate-key error trying to create their own
// private copy of a name another vendor already used. Two uncategorized
// ("category": null) brands with the same name, from the same vendor
// (or both shared defaults), are still blocked, same as before.
BrandSchema.index({ businessId: 1, vendorId: 1, category: 1, name: 1 }, { unique: true });

const Brand: Model<IBrand> =
  (mongoose.models.Brand as Model<IBrand>) ||
  mongoose.model<IBrand>("Brand", BrandSchema);

export default Brand;
