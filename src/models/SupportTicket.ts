import mongoose, { Schema, Model, Document } from "mongoose";

export interface ISupportTicketMessage {
  from: "CUSTOMER" | "ADMIN";
  message: string;
  authorName?: string;
  createdAt: Date;
}

export interface ISupportTicket extends Document {
  businessId: mongoose.Types.ObjectId;
  ticketNumber: string;
  name: string;
  email?: string;
  phone?: string;
  orderId?: string;
  subject: string;
  status: "OPEN" | "IN_PROGRESS" | "CLOSED";
  messages: ISupportTicketMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<ISupportTicketMessage>(
  {
    from: { type: String, enum: ["CUSTOMER", "ADMIN"], required: true },
    message: { type: String, required: true, trim: true },
    authorName: { type: String, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const SupportTicketSchema = new Schema<ISupportTicket>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    // Customer-facing token used to look up/update a ticket without an
    // account -- deliberately human-typeable (not a raw ObjectId).
    ticketNumber: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    orderId: { type: String, trim: true },
    subject: { type: String, required: true, trim: true },
    status: { type: String, enum: ["OPEN", "IN_PROGRESS", "CLOSED"], default: "OPEN" },
    messages: { type: [MessageSchema], default: [] },
  },
  { timestamps: true }
);

SupportTicketSchema.index({ businessId: 1, status: 1, createdAt: -1 });

const SupportTicket: Model<ISupportTicket> =
  (mongoose.models.SupportTicket as Model<ISupportTicket>) ||
  mongoose.model<ISupportTicket>("SupportTicket", SupportTicketSchema);

export default SupportTicket;
