import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * A vendor's own shop expense (rent, salaries, electricity, misc
 * purchases) -- the missing third term of Revenue − COGS − Expenses that
 * made a real Profit & Loss statement impossible before this model
 * existed (Sales Invoices covered revenue, StockLedger covered material
 * cost, but nothing captured actual shop running costs at all).
 */
export const EXPENSE_CATEGORIES = [
  "Rent",
  "Salaries & Wages",
  "Electricity",
  "Utilities",
  "Transport & Logistics",
  "Marketing",
  "Repairs & Maintenance",
  "Office Supplies",
  "Professional Fees",
  "Taxes & Licenses",
  "Other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface IExpense extends Document {
  businessId: mongoose.Types.ObjectId;
  vendorId: mongoose.Types.ObjectId;
  date: Date;
  category: ExpenseCategory;
  description?: string;
  amount: number;
  paymentMode?: "CASH" | "UPI" | "BANK_TRANSFER" | "CARD" | "OTHER";
  createdBy: mongoose.Types.ObjectId;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ExpenseSchema = new Schema<IExpense>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "VendorProfile", required: true, index: true },
    date: { type: Date, required: true, default: Date.now },
    category: { type: String, enum: EXPENSE_CATEGORIES, required: true },
    description: { type: String, trim: true },
    amount: { type: Number, required: true, min: 0 },
    paymentMode: { type: String, enum: ["CASH", "UPI", "BANK_TRANSFER", "CARD", "OTHER"], default: "CASH" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ExpenseSchema.index({ vendorId: 1, date: -1 });

const Expense: Model<IExpense> = mongoose.models.Expense || mongoose.model<IExpense>("Expense", ExpenseSchema);

export default Expense;
