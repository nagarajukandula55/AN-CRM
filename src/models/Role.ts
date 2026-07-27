import mongoose, { Schema, Document, Model, Types } from 'mongoose';

/* ── Enums ────────────────────────────────────────────────────────────── */
export enum RoleType {
  SYSTEM = 'SYSTEM',
  CUSTOM = 'CUSTOM',
}

export enum RoleStatus {
  ACTIVE   = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

/* ── Interface ────────────────────────────────────────────────────────── */
export interface IRole extends Document {
  organizationId?: Types.ObjectId;
  businessId?:     Types.ObjectId;
  vendorId?:       Types.ObjectId;
  // Human-facing serial shown the moment a role is saved, e.g. "ECOM-0001"
  // -- generated via the canonical numbering engine (documentType "ROLE"),
  // format "{businessCode}-{seq}" (see scripts/seedRoleNumberConfig.ts).
  // Platform-wide roles (businessId null, e.g. SUPER_ADMIN) never get one.
  roleNumber?:     string;
  name:            string;
  code:            string;
  description:     string;
  color:           string;
  type:            RoleType;
  status:          RoleStatus;
  isSystem:        boolean;
  isDefault:       boolean;
  isProtected:     boolean;
  permissions:     string[];
  // Which page a user holding this role lands on right after login (e.g.
  // "/admin/crm" or "/vendor/dashboard"). Empty/unset falls back to the
  // existing default-per-account-type redirect logic.
  homeRoute?:      string;
  // Optional custom ordering of sidebar module keys for users holding this
  // role -- lets an admin re-arrange/nest the nav for a role (e.g. put CRM
  // Overview above Appointments/Workorders) without touching every other
  // role's layout. Missing/empty falls back to the built-in NAV_GROUPS order.
  moduleOrder?:    string[];
  createdBy?:      Types.ObjectId;
  // Soft-delete flag -- was checked with `{ $ne: true }` throughout the
  // roles API without ever being declared on the schema, so Mongoose
  // silently dropped it on every save (harmless only because "absent"
  // also satisfies `$ne: true`). Declared for real so a genuine soft
  // delete persists and is queryable.
  isDeleted?:      boolean;
  createdAt:       Date;
  updatedAt:       Date;
}

const RoleSchema = new Schema<IRole>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization',    default: null },
    businessId:     { type: Schema.Types.ObjectId, ref: 'Business',       default: null },
    // Scopes a role to one vendor's team (e.g. that vendor's own "Owner"/
    // "Manager" default roles) -- null for platform-wide and business-wide
    // roles. Combined with businessId in the compound unique index below so
    // every vendor can have its own "VENDOR_OWNER"-coded role without
    // colliding with any other vendor's.
    vendorId:       { type: Schema.Types.ObjectId, ref: 'VendorProfile',  default: null },
    // No `default` -- must stay genuinely ABSENT (not present-with-null)
    // on any role that doesn't get one (vendor default roles, legacy
    // platform roles), or the {businessId, roleNumber} sparse unique index
    // below stops being sparse in practice: Mongo's sparse index only
    // skips documents missing the field entirely, not documents where it's
    // explicitly null -- a `default: null` here meant every role got an
    // explicit null field, so a business's SECOND vendor-default role
    // collided with its first on {businessId, null}. Confirmed the hard
    // way against production before this fix.
    roleNumber:     { type: String },
    name:           { type: String, required: true, trim: true },
    // Not globally unique -- vendor-scoped default roles intentionally reuse
    // the same code (e.g. "VENDOR_OWNER") across every vendor. Uniqueness is
    // enforced by the compound index on {code, businessId, vendorId} below.
    code:           { type: String, required: true, uppercase: true, trim: true },
    description:    { type: String, default: '' },
    color:          { type: String, default: '#60a5fa' },
    type: {
      type:    String,
      enum:    Object.values(RoleType),
      default: RoleType.CUSTOM,
    },
    status: {
      type:    String,
      enum:    Object.values(RoleStatus),
      default: RoleStatus.ACTIVE,
      index:   true,
    },
    isSystem:    { type: Boolean, default: false },
    isDefault:   { type: Boolean, default: false },
    isProtected: { type: Boolean, default: false },
    permissions: [{ type: String }],
    homeRoute:   { type: String, default: '' },
    moduleOrder: [{ type: String }],
    createdBy:   { type: Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted:   { type: Boolean, default: false, index: true },
  },
  { timestamps: true, versionKey: false }
);

RoleSchema.index({ code: 1, businessId: 1, vendorId: 1 }, { unique: true });
RoleSchema.index({ organizationId: 1, status: 1 });
RoleSchema.index({ businessId: 1, vendorId: 1, status: 1 });
// A compound `sparse` index here would NOT actually skip roleNumber-less
// roles (vendor default roles, legacy platform roles) -- MongoDB only
// excludes a document from a compound sparse index when it's missing
// EVERY field in the key, and `businessId` is always present. A partial
// index with an explicit filter is the correct way to make this unique
// constraint apply only to roles that actually have a roleNumber.
RoleSchema.index(
  { businessId: 1, roleNumber: 1 },
  { unique: true, partialFilterExpression: { roleNumber: { $type: "string" } } }
);

const Role: Model<IRole> =
  mongoose.models.Role || mongoose.model<IRole>('Role', RoleSchema);

export default Role;
