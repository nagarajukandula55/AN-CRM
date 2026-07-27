import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Singleton-per-app config for the React Native mobile app (see /mobile in
 * this repo). Lets a super admin control which Business tenant the app
 * represents (mirrors mobile/app.json's `anBusinessId`, but editable
 * without a rebuild) and OS-specific rollout controls (minimum supported
 * version, force-update, maintenance mode) without shipping a new app
 * build for every change — the app reads this via
 * GET /api/mobile-app/config on launch.
 *
 * One document per `appKey` (default "native") in case a second mobile
 * app is ever added, rather than a true global singleton.
 */
export interface IMobileAppConfig extends Document {
  appKey: string;
  businessId?: mongoose.Types.ObjectId;
  ios: {
    minVersion?: string;
    forceUpdate: boolean;
    storeUrl?: string;
  };
  android: {
    minVersion?: string;
    forceUpdate: boolean;
    storeUrl?: string;
  };
  maintenanceMode: boolean;
  maintenanceMessage?: string;
  pushNotificationsEnabled: boolean;
  updatedAt: Date;
}

const OsConfigSchema = new Schema(
  {
    minVersion: { type: String },
    forceUpdate: { type: Boolean, default: false },
    storeUrl: { type: String },
  },
  { _id: false }
);

const MobileAppConfigSchema = new Schema<IMobileAppConfig>(
  {
    appKey: { type: String, required: true, unique: true, default: "native" },
    businessId: { type: Schema.Types.ObjectId, ref: "Business" },
    ios: { type: OsConfigSchema, default: () => ({}) },
    android: { type: OsConfigSchema, default: () => ({}) },
    maintenanceMode: { type: Boolean, default: false },
    maintenanceMessage: { type: String },
    pushNotificationsEnabled: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

const MobileAppConfig: Model<IMobileAppConfig> =
  mongoose.models.MobileAppConfig ||
  mongoose.model<IMobileAppConfig>("MobileAppConfig", MobileAppConfigSchema);

export default MobileAppConfig;
