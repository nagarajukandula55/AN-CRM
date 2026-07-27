import mongoose, { Schema, Model, Document, Types } from "mongoose";
import { DEVICE_CATEGORIES, type DeviceCategory } from "@/core/catalog/deviceCategory";

/**
 * A staff-submitted proposal to add a new Brand/Series/DeviceModel/Variant
 * to the catalog, raised from the CRM call/jobsheet creation forms' "Can't
 * find it? Request to add" flow when the real catalog is missing what they
 * need. Submitting requires only a normal, broadly-grantable CATALOG.CREATE
 * permission; APPROVING is a separate, hardcoded session.isSuperAdmin-only
 * action (see api/catalog/requests/[id]/approve) -- same reasoning as
 * VendorProduct's submit/approve split (see that route's top comment): a
 * generic "approve" permission can be over-granted to a vendor "full
 * access" role, which would let someone approve (and thus self-serve) their
 * own catalog request.
 */
export type CatalogChangeRequestKind = "BRAND" | "SERIES" | "MODEL" | "VARIANT";
export type CatalogChangeRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ICatalogChangeRequest extends Document {
  businessId: Types.ObjectId;
  requestedBy: Types.ObjectId; // ref User
  kind: CatalogChangeRequestKind;
  name: string; // proposed new name

  // Scope fields -- which ones are meaningful/required depends on `kind`:
  //   BRAND   -> category required
  //   SERIES  -> brandId required
  //   MODEL   -> brandId required, seriesId optional (Direct-under-brand)
  //   VARIANT -> modelId required
  category?: DeviceCategory | null;
  brandId?: Types.ObjectId; // ref Brand
  seriesId?: Types.ObjectId; // ref Series
  modelId?: Types.ObjectId; // ref DeviceModel

  status: CatalogChangeRequestStatus;
  rejectionReason?: string;
  reviewedBy?: Types.ObjectId; // ref User
  reviewedAt?: Date;

  // Set on approval -- links the request to the real catalog entity it
  // resulted in (whether newly created, or an existing one found via the
  // race-guard at approval time).
  resultEntityId?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

const CatalogChangeRequestSchema = new Schema<ICatalogChangeRequest>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    kind: { type: String, enum: ["BRAND", "SERIES", "MODEL", "VARIANT"], required: true },
    name: { type: String, required: true, trim: true },

    category: { type: String, enum: DEVICE_CATEGORIES, default: null },
    brandId: { type: Schema.Types.ObjectId, ref: "Brand" },
    seriesId: { type: Schema.Types.ObjectId, ref: "Series" },
    modelId: { type: Schema.Types.ObjectId, ref: "DeviceModel" },

    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING", index: true },
    rejectionReason: { type: String },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    resultEntityId: { type: Schema.Types.ObjectId },
  },
  { timestamps: true }
);

CatalogChangeRequestSchema.index({ businessId: 1, status: 1 });

const CatalogChangeRequest: Model<ICatalogChangeRequest> =
  (mongoose.models.CatalogChangeRequest as Model<ICatalogChangeRequest>) ||
  mongoose.model<ICatalogChangeRequest>("CatalogChangeRequest", CatalogChangeRequestSchema);

export default CatalogChangeRequest;
