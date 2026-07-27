import mongoose, { Schema, Document, Model } from "mongoose";

export interface ILeaveRequest extends Document {
  businessId: mongoose.Types.ObjectId;
  employeeName: string;
  leaveType: string;
  fromDate: Date;
  toDate: Date;
  reason?: string;
  days: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: Date;
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
}

const LeaveRequestSchema = new Schema<ILeaveRequest>(
  {
    businessId: { type: Schema.Types.ObjectId, required: true, index: true },
    employeeName: { type: String, required: true },
    leaveType: { type: String, required: true },
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    reason: { type: String },
    days: { type: Number, default: 1 },
    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

LeaveRequestSchema.pre("validate", function (next) {
  if (this.fromDate && this.toDate) {
    this.days = daysBetween(this.fromDate, this.toDate);
  }
  next();
});

LeaveRequestSchema.index({ businessId: 1, createdAt: -1 });

const LeaveRequest: Model<ILeaveRequest> =
  mongoose.models.LeaveRequest || mongoose.model<ILeaveRequest>("LeaveRequest", LeaveRequestSchema);

export default LeaveRequest;
