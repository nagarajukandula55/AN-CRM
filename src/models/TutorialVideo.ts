import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * A tutorial video entry in the vendor Help Center (/vendor/help). Admin-
 * managed catalog -- videoUrl is deliberately just a URL string (not an
 * uploaded-file pipeline): it accepts either a direct video file URL
 * (rendered in a <video> tag) or an embed URL from YouTube/Vimeo/Loom/etc.
 * (rendered in an <iframe>), whichever the admin actually has. A row with
 * no videoUrl yet is a placeholder -- it shows in the admin catalog so
 * nothing gets forgotten, but stays unpublished (hidden from vendors)
 * until a real video is attached.
 *
 * `key` is what feature pages link to for a contextual "Watch tutorial"
 * shortcut (see components/shared/TutorialLink.tsx) -- e.g. the Telegram
 * setup page links to key "telegram-setup" -- so it must stay stable once
 * any page references it.
 */
export interface ITutorialVideo extends Document {
  key: string;
  title: string;
  description: string;
  category: string;
  videoUrl: string;
  thumbnailUrl: string;
  sortOrder: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TutorialVideoSchema = new Schema<ITutorialVideo>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    category: { type: String, required: true, trim: true },
    videoUrl: { type: String, default: "" },
    thumbnailUrl: { type: String, default: "" },
    sortOrder: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

TutorialVideoSchema.index({ category: 1, sortOrder: 1 });

const TutorialVideo: Model<ITutorialVideo> =
  mongoose.models.TutorialVideo || mongoose.model<ITutorialVideo>("TutorialVideo", TutorialVideoSchema);

export default TutorialVideo;
