import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Single-document collection tracking the last pincode dataset upload —
 * powers the "last updated on X by Y, N pincodes loaded" status shown on
 * /admin/pincode-data so admins can see whether the data is stale without
 * having to query the full PincodeEntry collection themselves.
 */
export interface IPincodeDatasetMeta extends Document {
  totalPincodes: number;
  sourceFileName?: string;
  uploadedBy?: mongoose.Types.ObjectId;
  uploadedAt: Date;
}

const PincodeDatasetMetaSchema = new Schema<IPincodeDatasetMeta>(
  {
    totalPincodes: { type: Number, required: true },
    sourceFileName: { type: String, default: "" },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    uploadedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

const PincodeDatasetMeta: Model<IPincodeDatasetMeta> =
  mongoose.models.PincodeDatasetMeta ||
  mongoose.model<IPincodeDatasetMeta>("PincodeDatasetMeta", PincodeDatasetMetaSchema);

export default PincodeDatasetMeta;
