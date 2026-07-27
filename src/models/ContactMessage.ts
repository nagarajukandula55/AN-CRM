import mongoose, { Schema, Model, Document } from "mongoose";

/**
 * ContactMessage — a single site-wide inbox for messages submitted through
 * the public "Contact Us" form (see app/contact/page.tsx and
 * api/contact/route.ts). Deliberately NOT businessId-scoped: this is AN
 * Group's own corporate contact form, not a per-tenant feature.
 */
export type ContactMessageStatus = "NEW" | "READ" | "RESOLVED";

export interface IContactMessage extends Document {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  status: ContactMessageStatus;
  createdAt: Date;
  updatedAt: Date;
}

const ContactMessageSchema = new Schema<IContactMessage>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    status: { type: String, enum: ["NEW", "READ", "RESOLVED"], default: "NEW", index: true },
  },
  { timestamps: true }
);

const ContactMessage: Model<IContactMessage> =
  (mongoose.models.ContactMessage as Model<IContactMessage>) ||
  mongoose.model<IContactMessage>("ContactMessage", ContactMessageSchema);

export default ContactMessage;
