/**
 * Super-admin-configurable option lists for CRM job sheet fields that used
 * to be hardcoded <select> options in the New Job Sheet form (Appointment
 * Type: Onsite/Walk-in, Request Type: Repair/Installation) -- per explicit
 * request, these must be admin-editable master data, not something only a
 * developer can change. One model, two `listType` values, rather than two
 * near-identical collections -- same shape either way (code + label).
 */
import mongoose, { Schema, Model, Document, Types } from "mongoose";

export type CrmOptionListType = "APPOINTMENT_TYPE" | "REQUEST_TYPE";

export interface ICrmOptionList extends Document {
  businessId?: Types.ObjectId | null;
  listType: CrmOptionListType;
  code: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CrmOptionListSchema = new Schema<ICrmOptionList>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", default: null, index: true },
    listType: { type: String, enum: ["APPOINTMENT_TYPE", "REQUEST_TYPE"], required: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    label: { type: String, required: true, trim: true },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

CrmOptionListSchema.index({ businessId: 1, listType: 1, isActive: 1 });
CrmOptionListSchema.index({ businessId: 1, listType: 1, code: 1 }, { unique: true });

const CrmOptionList: Model<ICrmOptionList> =
  (mongoose.models.CrmOptionList as Model<ICrmOptionList>) ||
  mongoose.model<ICrmOptionList>("CrmOptionList", CrmOptionListSchema);

export default CrmOptionList;
