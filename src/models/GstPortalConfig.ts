/**
 * GstPortalConfig — per-business GST portal connection settings.
 *
 * Same shape convention as AIConfig.ts (one document per business, admin-
 * editable in Settings, secrets stored server-side only, never returned to
 * the client in a GET — see api/gst/config/route.ts). Filled in here rather
 * than piggybacking on Business.compliance.gstNumber because portal API
 * credentials (GSP/ASP client id+secret, GSTN username) are a distinct,
 * more sensitive concern than just "what is this business's GSTIN".
 */

import mongoose, { Schema, Model, Document } from "mongoose";

export interface IGstPortalConfig extends Document {
  businessId: mongoose.Types.ObjectId;
  gstin: string;
  /** Which GSP/ASP (GST Suvidha Provider) integration this business uses, if any */
  provider?: "GSTN_DIRECT" | "CLEARTAX" | "MASTERS_INDIA" | "NONE";
  /** API credentials for the chosen provider — server-side only, never sent to the client */
  apiKey?: string;
  apiSecret?: string;
  username?: string;
  isEnabled: boolean;
  autoSubmit: boolean; // if true, invoices auto-queue a GstFiling on creation instead of requiring a manual "push"
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const GstPortalConfigSchema = new Schema<IGstPortalConfig>(
  {
    businessId: { type: Schema.Types.ObjectId, required: true, unique: true },
    gstin: { type: String, required: true },
    provider: {
      type: String,
      enum: ["GSTN_DIRECT", "CLEARTAX", "MASTERS_INDIA", "NONE"],
      default: "NONE",
    },
    apiKey: { type: String },
    apiSecret: { type: String },
    username: { type: String },
    isEnabled: { type: Boolean, default: false },
    autoSubmit: { type: Boolean, default: false },
    updatedBy: { type: Schema.Types.ObjectId },
  },
  { timestamps: true }
);

const GstPortalConfig: Model<IGstPortalConfig> =
  (mongoose.models.GstPortalConfig as Model<IGstPortalConfig>) ||
  mongoose.model<IGstPortalConfig>("GstPortalConfig", GstPortalConfigSchema);

export default GstPortalConfig;
