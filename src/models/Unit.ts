import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUnit extends Document {
  businessId: mongoose.Types.ObjectId;
  name: string;
  symbol: string;
  description?: string;
  type?: string; // e.g. "weight", "volume", "length", "quantity", "other"
  isActive: boolean;
  isDeleted: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const UnitSchema = new Schema<IUnit>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    name: { type: String, required: true, trim: true },
    symbol: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    type: {
      type: String,
      enum: ["weight", "volume", "length", "quantity", "time", "other"],
      default: "other",
    },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

UnitSchema.index({ businessId: 1, name: 1 });
UnitSchema.index({ businessId: 1, symbol: 1 });
UnitSchema.index({ businessId: 1, isDeleted: 1 });

const Unit: Model<IUnit> =
  mongoose.models.Unit || mongoose.model<IUnit>("Unit", UnitSchema);

export default Unit;
