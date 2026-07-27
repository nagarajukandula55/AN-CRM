/**
 * Date-stamped FX rate: 1 unit of baseCurrency = `rate` units of
 * quoteCurrency, effective on `effectiveDate`. Rates are never overwritten
 * once recorded -- a new rate for the same pair gets a new effectiveDate
 * row, so historical documents (and their stored `homeCurrencyAmount`,
 * computed at transaction time) stay reproducible even after rates move.
 *
 * Not consumed anywhere yet -- this is the multi-currency data layer built
 * ahead of the feature per explicit direction ("design for multi-currency
 * now, focus build on single-currency first"). Single-currency (India-only)
 * businesses never touch this table; every transactional document defaults
 * currency = Business.financial.homeCurrency and fxRate = 1.
 */

import mongoose, { Schema, Document, Model } from "mongoose";

export type ExchangeRateSource = "MANUAL" | "API_PROVIDER";

export interface IExchangeRate extends Document {
  baseCurrency: string; // ref Currency.code
  quoteCurrency: string; // ref Currency.code
  rate: number;
  effectiveDate: Date;
  source: ExchangeRateSource;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ExchangeRateSchema = new Schema<IExchangeRate>(
  {
    baseCurrency: { type: String, required: true, uppercase: true, trim: true, index: true },
    quoteCurrency: { type: String, required: true, uppercase: true, trim: true, index: true },
    rate: { type: Number, required: true, min: 0 },
    effectiveDate: { type: Date, required: true, index: true },
    source: { type: String, enum: ["MANUAL", "API_PROVIDER"], default: "MANUAL" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true, versionKey: false }
);

ExchangeRateSchema.index(
  { baseCurrency: 1, quoteCurrency: 1, effectiveDate: 1 },
  { unique: true }
);

const ExchangeRate: Model<IExchangeRate> =
  mongoose.models.ExchangeRate ||
  mongoose.model<IExchangeRate>("ExchangeRate", ExchangeRateSchema);

export default ExchangeRate;
