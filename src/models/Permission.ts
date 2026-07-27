import mongoose, { Schema, Document, Model } from 'mongoose';

/* ── Enums (runtime values + type inference) ───────────────────────────── */
export enum PermissionType {
  SYSTEM = 'SYSTEM',
  CUSTOM = 'CUSTOM',
}

export enum PermissionStatus {
  ACTIVE   = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

/* ── Interface ─────────────────────────────────────────────────────────── */
export interface IPermission extends Document {
  code:        string;
  name:        string;
  description: string;
  module:      string;
  group:       string;
  type:        PermissionType;
  status:      PermissionStatus;
  isActive:    boolean;
  isProtected: boolean;
  isDeleted:   boolean;
  createdAt:   Date;
  updatedAt:   Date;
}

const PermissionSchema = new Schema<IPermission>(
  {
    code:        { type: String, required: true, unique: true, uppercase: true, trim: true },
    name:        { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    module:      { type: String, default: 'GENERAL', index: true },
    group:       { type: String, default: 'GENERAL', index: true },
    type: {
      type:    String,
      enum:    Object.values(PermissionType),
      default: PermissionType.CUSTOM,
    },
    status: {
      type:    String,
      enum:    Object.values(PermissionStatus),
      default: PermissionStatus.ACTIVE,
      index:   true,
    },
    isActive:    { type: Boolean, default: true,  index: true },
    isProtected: { type: Boolean, default: false },
    isDeleted:   { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

// `code` already gets a unique index from the field's own `unique: true`
// above -- this duplicate .index({ code: 1 }) call produced Mongoose's
// "Duplicate schema index" warning on every boot.
PermissionSchema.index({ module: 1, group: 1, status: 1 });

const Permission: Model<IPermission> =
  mongoose.models.Permission || mongoose.model<IPermission>('Permission', PermissionSchema);

export default Permission;
