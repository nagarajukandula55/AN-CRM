/**
 * Short-lived email-OTP verification for public/unauthenticated flows
 * (currently: the public appointment-request page). Separate from the
 * agreement-signing OTP on VendorProfile/Agreement -- this is a general-
 * purpose "prove you own this email" step, not tied to any one entity.
 * A verified record's `token` is a one-time, time-boxed proof the caller
 * passes back into the real submission endpoint.
 */
import mongoose, { Schema, Model, Document } from "mongoose";

export interface IPublicEmailVerification extends Document {
  email: string;
  purpose: string;
  otpHash: string;
  otpExpiresAt: Date;
  verified: boolean;
  token?: string;
  tokenExpiresAt?: Date;
  createdAt: Date;
}

const PublicEmailVerificationSchema = new Schema<IPublicEmailVerification>(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    purpose: { type: String, required: true },
    otpHash: { type: String, required: true },
    otpExpiresAt: { type: Date, required: true },
    verified: { type: Boolean, default: false },
    token: { type: String, index: true },
    tokenExpiresAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const PublicEmailVerification: Model<IPublicEmailVerification> =
  (mongoose.models.PublicEmailVerification as Model<IPublicEmailVerification>) ||
  mongoose.model<IPublicEmailVerification>("PublicEmailVerification", PublicEmailVerificationSchema);

export default PublicEmailVerification;
