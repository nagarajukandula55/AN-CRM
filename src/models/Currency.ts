/**
 * Platform-wide currency master (not per-business). Seeded with INR at
 * minimum; more currencies get added as businesses outside India onboard.
 * Every transactional document's `currency` field is expected to reference
 * a code from here, but that reference is by-convention (string code, not
 * ObjectId) so documents never break if a currency is later deactivated.
 */

import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICurrency extends Document {
  code: string; // ISO 4217, e.g. "INR", "USD" -- primary key, not _id
  name: string; // "Indian Rupee"
  symbol: string; // "₹"
  decimalPlaces: number; // 2 for most, 0 for JPY, 3 for KWD -- never hardcode 2
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CurrencySchema = new Schema<ICurrency>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    symbol: { type: String, required: true, trim: true },
    decimalPlaces: { type: Number, default: 2, min: 0, max: 4 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, versionKey: false }
);

const Currency: Model<ICurrency> =
  mongoose.models.Currency || mongoose.model<ICurrency>("Currency", CurrencySchema);

export default Currency;
