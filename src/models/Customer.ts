/**
 * Customer — a standalone customer record, independent of any one order or
 * invoice. No such collection existed before this: SalesInvoice.customer
 * (and similar embedded shapes elsewhere) are per-document snapshots, not a
 * real customer directory. Built for manual entry now, with each business's
 * own customer data expected to be aggregated in here later (hence the
 * optional businessId + free-text source field rather than a hard link).
 */

import mongoose, { Schema, Model, Document, Types } from "mongoose";

export interface ICustomer extends Document {
  businessId?: Types.ObjectId | null;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  // Free text: "manual", a business name, an import batch label, etc. --
  // not an enum since this will grow organically as businesses are
  // aggregated in. Kept alongside the more structured fields below rather
  // than replaced, so existing free-text values keep working.
  source?: string;
  // Which capture point actually created this record, e.g. "CRM_LEAD",
  // "APPOINTMENT_REQUEST", "NEWSLETTER", "VENDOR_APPLY", "REGISTRATION" --
  // a stable, queryable code (unlike the free-text `source` above) so
  // "how many customers came from newsletter signups" is a real filter,
  // not a string-match guess.
  sourceModule?: string;
  // Set only when this customer was captured via a specific vendor's own
  // flow (e.g. a vendor's storefront lead) -- null for anything captured
  // directly by the business itself.
  vendorId?: Types.ObjectId | null;
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerSchema = new Schema<ICustomer>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", default: null, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },
    source: { type: String, trim: true, default: "manual" },
    sourceModule: { type: String, trim: true, index: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "VendorProfile", default: null },
    notes: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

CustomerSchema.index({ businessId: 1, isActive: 1 });
CustomerSchema.index({ name: "text", phone: "text", email: "text" });

const Customer: Model<ICustomer> =
  (mongoose.models.Customer as Model<ICustomer>) ||
  mongoose.model<ICustomer>("Customer", CustomerSchema);

export default Customer;
