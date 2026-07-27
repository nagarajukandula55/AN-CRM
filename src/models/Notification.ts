import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Persistent, per-user notification feed backing /admin/notifications and
 * the sidebar's unread-count badge. Distinct from AuditLog (an immutable
 * system-wide trail of what happened) -- this is user-facing, mutable
 * (isRead), and deletable, and always addressed to a specific recipient.
 */
export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  businessId?: mongoose.Types.ObjectId;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  link?: string;
  isRead: boolean;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: Schema.Types.ObjectId, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, enum: ["info", "success", "warning", "error"], default: "info" },
    link: { type: String },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, isRead: 1 });

const Notification: Model<INotification> =
  mongoose.models.Notification || mongoose.model<INotification>("Notification", NotificationSchema);

export default Notification;
