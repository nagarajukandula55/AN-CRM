import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * A pending phone-OTP login attempt -- separate from PublicEmailVerification
 * (that model is keyed by email, for a different purpose: pre-verifying an
 * email before a public form submits). One doc per phone number; a new
 * send overwrites any prior unverified OTP for that phone, same convention
 * as every other OTP flow in this app (appointment-request, agreement
 * signing).
 */
export interface IPhoneOtpLogin extends Document {
  phone: string;
  otpHash: string;
  otpExpiresAt: Date;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
}

const PhoneOtpLoginSchema = new Schema<IPhoneOtpLogin>(
  {
    phone: { type: String, required: true, unique: true, trim: true },
    otpHash: { type: String, required: true },
    otpExpiresAt: { type: Date, required: true },
    // Caps brute-force guesses against a single sent OTP before it must be
    // re-sent -- see api/auth/otp/verify/route.ts.
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const PhoneOtpLogin: Model<IPhoneOtpLogin> =
  mongoose.models.PhoneOtpLogin || mongoose.model<IPhoneOtpLogin>("PhoneOtpLogin", PhoneOtpLoginSchema);

export default PhoneOtpLogin;
