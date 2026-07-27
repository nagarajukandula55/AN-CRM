import mongoose, { Schema, Document, Model } from "mongoose";

export interface IPayroll extends Document {
  businessId: mongoose.Types.ObjectId;
  employeeId?: string;
  employeeName: string;
  designation?: string;
  month: number; // 1-12
  year: number;
  basicSalary: number;
  allowances: number;
  deductions: number;
  netSalary: number;
  status: "PENDING" | "PAID" | "ON_HOLD";
  paidAt?: Date;
}

const PayrollSchema = new Schema<IPayroll>(
  {
    businessId: { type: Schema.Types.ObjectId, required: true, index: true },
    employeeId: { type: String },
    employeeName: { type: String, required: true },
    designation: { type: String },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
    basicSalary: { type: Number, default: 0 },
    allowances: { type: Number, default: 0 },
    deductions: { type: Number, default: 0 },
    netSalary: { type: Number, default: 0 },
    status: { type: String, enum: ["PENDING", "PAID", "ON_HOLD"], default: "PENDING" },
    paidAt: { type: Date },
  },
  { timestamps: true }
);

PayrollSchema.pre("validate", function (next) {
  this.netSalary = (this.basicSalary || 0) + (this.allowances || 0) - (this.deductions || 0);
  next();
});

PayrollSchema.index({ businessId: 1, year: 1, month: 1 });

const Payroll: Model<IPayroll> =
  mongoose.models.Payroll || mongoose.model<IPayroll>("Payroll", PayrollSchema);

export default Payroll;
