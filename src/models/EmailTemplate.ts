import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Super-admin-configured subject/body for one transactional email occasion
 * (see core/email/emailOccasions.ts's catalog) -- applied platform-wide,
 * every business's email of that occasion. One document per occasion key;
 * missing a key means that occasion still uses its hardcoded fallback
 * text (see services/email/resend.service.ts). Mirrors
 * models/TelegramMessageTemplate.ts's exact pattern.
 */
export interface IEmailTemplate extends Document {
  key: string;
  subject: string;
  html: string;
  enabled: boolean;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EmailTemplateSchema = new Schema<IEmailTemplate>(
  {
    key: { type: String, required: true, unique: true, uppercase: true, trim: true },
    subject: { type: String, required: true },
    html: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    updatedBy: { type: String },
  },
  { timestamps: true }
);

const EmailTemplate: Model<IEmailTemplate> =
  mongoose.models.EmailTemplate || mongoose.model<IEmailTemplate>("EmailTemplate", EmailTemplateSchema);

export default EmailTemplate;
