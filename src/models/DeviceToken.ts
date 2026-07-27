/**
 * DeviceToken — Expo push tokens registered by native mobile clients
 * (ANgroup/mobile, ANu). One user can hold several (multiple devices);
 * one token belongs to exactly one user at a time — re-registering the
 * same token under a different user (e.g. device passed to someone else,
 * or a shared test device) reassigns it rather than creating a duplicate
 * row, since Expo tokens are stable per device+app install, not per user.
 */

import mongoose, { Schema, Model, Document } from "mongoose";

export interface IDeviceToken extends Document {
  userId: mongoose.Types.ObjectId;
  token: string;
  platform: "ios" | "android" | "unknown";
  createdAt: Date;
  updatedAt: Date;
}

const DeviceTokenSchema = new Schema<IDeviceToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    token: { type: String, required: true, unique: true },
    platform: { type: String, enum: ["ios", "android", "unknown"], default: "unknown" },
  },
  { timestamps: true }
);

const DeviceToken: Model<IDeviceToken> =
  (mongoose.models.DeviceToken as Model<IDeviceToken>) ||
  mongoose.model<IDeviceToken>("DeviceToken", DeviceTokenSchema);

export default DeviceToken;
