import mongoose, { Schema, Document, Model } from 'mongoose';

/** Admin-editable list mapping a registering site's origin to a
 * registrationSource label + the default Role code new users from that
 * origin get. Lets Super Admin add/change SSO sources (e.g. a future third
 * storefront) without a code change. */
export interface ISsoSourceMapping extends Document {
  urlPattern: string;
  sourceLabel: string;
  defaultRoleCode: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SsoSourceMappingSchema = new Schema<ISsoSourceMapping>(
  {
    urlPattern:      { type: String, required: true, unique: true, trim: true, lowercase: true },
    sourceLabel:     { type: String, required: true, trim: true },
    defaultRoleCode: { type: String, required: true, uppercase: true, trim: true },
    isActive:        { type: Boolean, default: true, index: true },
  },
  { timestamps: true, versionKey: false }
);

const SsoSourceMapping: Model<ISsoSourceMapping> =
  mongoose.models.SsoSourceMapping ||
  mongoose.model<ISsoSourceMapping>('SsoSourceMapping', SsoSourceMappingSchema);

export default SsoSourceMapping;
