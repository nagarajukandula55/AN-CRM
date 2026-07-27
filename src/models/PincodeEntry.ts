import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * India pincode -> state/district/city lookup, stored in MongoDB rather
 * than a bundled static JSON file. This app deploys on Vercel, which has a
 * READ-ONLY filesystem at runtime — a static JSON file could be seeded at
 * build time but could never be updated afterwards without a full
 * redeploy, which defeats the point of an admin-facing "upload a refreshed
 * pincode file" feature. Storing it here means the upload endpoint
 * (POST /api/admin/pincode-data) can actually replace the live dataset by
 * writing to the database, and every environment (local dev, Vercel prod)
 * reads the same source of truth.
 *
 * Seeded initially from the official India Post All India Pincode
 * Directory (~19,500 unique pincodes) — see scripts/seedPincodes.ts.
 */
export interface IPincodeEntry extends Document {
  pincode: string;
  state: string;
  district: string;
  city: string;
  updatedAt: Date;
}

const PincodeEntrySchema = new Schema<IPincodeEntry>(
  {
    pincode: { type: String, required: true, unique: true, index: true },
    state: { type: String, required: true, index: true },
    district: { type: String, default: "" },
    city: { type: String, default: "" },
  },
  { timestamps: true }
);

const PincodeEntry: Model<IPincodeEntry> =
  mongoose.models.PincodeEntry ||
  mongoose.model<IPincodeEntry>("PincodeEntry", PincodeEntrySchema);

export default PincodeEntry;
