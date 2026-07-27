/**
 * ServiceCenterBOM — the canonical Material/BOM entry for the CRM, standard
 * across every operating mode (Brand / SC / POS), per the platform-wide BOM
 * spec: Material Code, Material Description, Mode, SN, HSN, Rate, Tax%.
 * Mapping onto this model's fields:
 *   Material Code        -> partCode        (auto-generated or manual, see
 *                            Business.bomCodeGenerationMode)
 *   Material Description -> partName + description
 *   Mode                 -> partType (SPARE_PART / LABOUR / CONSUMABLE)
 *   SN                   -> isSerialized (whether this material is tracked
 *                            by serial number when the owning business has
 *                            Business.inventorySerialized enabled)
 *   HSN                  -> hsnCode
 *   Rate                 -> rate (without tax)
 *   Tax%                 -> gstRate
 *
 * Originally built specific to service-center repair estimation/invoicing
 * (vendorId-scoped part price lists feeding CrmJobSheet line items at
 * close time) -- kept as the SAME model rather than forked, since a Brand
 * or POS business's material list needs exactly this shape. `vendorId` is
 * now optional precisely so non-SC businesses (no vendor concept) can also
 * use this model directly; existing SC routes are unaffected since they
 * always pass a real vendorId.
 *
 * Distinct from the manufacturing src/models/BOM.js (multi-level
 * production BOM with cost roll-ups) and the vendor-onboarding
 * src/models/VendorProductBOM.js -- those remain separate, deeper
 * structures for their own flows.
 *
 * Every entry carries a businessId (required) and an optional vendorId
 * ("business tag and vendor tag") so a vendor's part list stays private to
 * them within their business, per the original spec ("this BOM should be
 * available to that particular partner who had made [it]").
 */

import mongoose, { Schema, Model, Document, Types } from "mongoose";

export type ServiceCenterBOMPartType = "SPARE_PART" | "LABOUR" | "CONSUMABLE";

export interface IServiceCenterBOM extends Document {
  businessId: Types.ObjectId;
  // Optional -- unset for a Brand/POS business's own material list (no
  // vendor concept there). SC entries always carry a real vendorId.
  vendorId?: Types.ObjectId;
  brandId?: Types.ObjectId; // ref Brand -- which device brand this part fits, if any
  // Which Series this part fits, if any -- lets a part be scoped to a whole
  // product line (e.g. "any Galaxy S phone") without pinning it to one
  // exact deviceModelId. Denormalized here (rather than requiring a join
  // through DeviceModel) purely so GET /api/service-center-bom can filter
  // on it directly; auto-set from deviceModelId's own seriesId whenever a
  // deviceModelId is chosen, so the two never disagree.
  seriesId?: Types.ObjectId; // ref Series
  // Which specific device model this part fits, if any -- optional and
  // nested under brandId (a part can be brand-wide/"Any Model" with this
  // unset, or scoped to one exact model). Together with brandId this is
  // the Brand -> Model -> Part tree the management page organizes parts
  // by, per explicit direction.
  deviceModelId?: Types.ObjectId; // ref DeviceModel
  partName: string;
  partCode: string;
  description?: string; // spec/detail beyond the name, for GST-invoice line clarity
  partType: ServiceCenterBOMPartType;
  unit: string; // e.g. "pcs", "nos", "set"
  hsnCode: string;
  gstRate: number; // % -- explicit on the part, not just derived from HSN lookup at billing time
  rate: number; // without tax
  warrantyDays?: number;
  // Whether this material is tracked by individual serial number. Only
  // meaningful (and only enforced at transaction time) when the owning
  // Business has inventorySerialized = true -- see Business.ts. Default
  // false preserves current behaviour (a plain price-list entry, no serial
  // tracking) for every existing part.
  isSerialized: boolean;
  // Optional link to a real Inventory-tracked Material -- only consulted
  // when the business has Business.inventorySerialized = true; lets the
  // workorder repair flow check real stock before allowing this part to be
  // added, and deduct on close. When unset (the default), this part
  // behaves exactly as before -- a plain price-list entry with no stock
  // tracking.
  materialId?: Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ServiceCenterBOMSchema = new Schema<IServiceCenterBOM>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "VendorProfile", default: null, index: true },
    brandId: { type: Schema.Types.ObjectId, ref: "Brand", index: true },
    seriesId: { type: Schema.Types.ObjectId, ref: "Series", index: true },
    deviceModelId: { type: Schema.Types.ObjectId, ref: "DeviceModel", index: true },
    partName: { type: String, required: true, trim: true },
    partCode: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    partType: { type: String, enum: ["SPARE_PART", "LABOUR", "CONSUMABLE"], default: "SPARE_PART" },
    unit: { type: String, trim: true, default: "pcs" },
    hsnCode: { type: String, required: true, trim: true },
    gstRate: { type: Number, required: true, min: 0, max: 100, default: 18 },
    rate: { type: Number, required: true, min: 0 },
    warrantyDays: { type: Number, min: 0 },
    isSerialized: { type: Boolean, default: false },
    materialId: { type: Schema.Types.ObjectId, ref: "Material", default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

ServiceCenterBOMSchema.index({ businessId: 1, vendorId: 1, partCode: 1 }, { unique: true });
ServiceCenterBOMSchema.index({ businessId: 1, vendorId: 1, isActive: 1 });

const ServiceCenterBOM: Model<IServiceCenterBOM> =
  (mongoose.models.ServiceCenterBOM as Model<IServiceCenterBOM>) ||
  mongoose.model<IServiceCenterBOM>("ServiceCenterBOM", ServiceCenterBOMSchema);

export default ServiceCenterBOM;
