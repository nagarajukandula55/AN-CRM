import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * A browser's Web Push subscription (registered via the Push API + a
 * service worker, see public/sw.js and lib/hooks/useBrowserPush.ts) --
 * distinct from DeviceToken (Expo push, mobile app only). Lets the server
 * pop a real OS-level notification on the website even when the tab isn't
 * focused/open, unlike the in-app bell list which only shows up while the
 * user is looking at the console.
 *
 * One row per (userId, subscription.endpoint) -- a user can have several
 * (different browsers/devices), and the same browser re-subscribing just
 * updates its existing row rather than duplicating.
 */
export interface IPushSubscription extends Document {
  userId: mongoose.Types.ObjectId;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String },
  },
  { timestamps: true }
);

PushSubscriptionSchema.index({ userId: 1, endpoint: 1 }, { unique: true });

const PushSubscription: Model<IPushSubscription> =
  mongoose.models.PushSubscription ||
  mongoose.model<IPushSubscription>("PushSubscription", PushSubscriptionSchema);

export default PushSubscription;
