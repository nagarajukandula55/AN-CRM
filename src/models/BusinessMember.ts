import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import { BUSINESS_MEMBER_TYPES } from '@/core/constants/businessMemberTypes';

/* ── Runtime const object (used as BusinessMemberStatus.ACTIVE etc.) ── */
export const BusinessMemberStatus = {
  ACTIVE:    'ACTIVE',
  INACTIVE:  'INACTIVE',
  PENDING:   'PENDING',
  SUSPENDED: 'SUSPENDED',
} as const;

/* ── Types ────────────────────────────────────────────────────────────── */
export type BusinessMemberStatus = typeof BusinessMemberStatus[keyof typeof BusinessMemberStatus];

// Canonical list lives in core/constants/businessMemberTypes.ts (plain data,
// safe to also import from client components like vendor/staff/page.tsx)
// so the dropdown there can never drift from this schema's enum again.
export type BusinessMemberType = (typeof BUSINESS_MEMBER_TYPES)[number];

/* Keep old alias names for any files that still use them */
export type MemberStatus = BusinessMemberStatus;
export type MemberType   = BusinessMemberType;

export interface IBusinessMember extends Document {
  userId:            Types.ObjectId;
  businessId:        Types.ObjectId;
  /**
   * Optional — set when this membership is actually "staff of one specific
   * vendor operating under this business", not a direct business-level
   * hire. Completes the hierarchy: AN Group > Businesses > Vendors under
   * respective businesses > Warehouses under vendors > Staff. Previously
   * this model had vendor-flavored memberType values (VENDOR_WAREHOUSE,
   * VENDOR_HELPER, etc.) but no vendorId to actually say WHICH vendor —
   * every "vendor staff" row was indistinguishable from a general business
   * hire once memberType stopped being read closely, and the unique
   * {userId,businessId} index meant one user could never be staff at two
   * different vendors under the same business, or be both a business
   * employee and a vendor's staff member.
   */
  vendorId?:         Types.ObjectId;
  /** Free-form, vendor-defined role label for vendor staff (e.g. "Warehouse
   * Manager", "Picker", "Delivery"). Distinct from `role` below, which is
   * historically used for business-level RBAC role names. */
  vendorRole?:       string;
  status:            BusinessMemberStatus;
  memberType:        BusinessMemberType;
  role?:             string;
  isDefaultBusiness: boolean;
  joinedAt:          Date;
  invitedBy?:        Types.ObjectId;
  isDeleted:         boolean;
  createdAt:         Date;
  updatedAt:         Date;
}

const BusinessMemberSchema = new Schema<IBusinessMember>(
  {
    userId:     { type: Schema.Types.ObjectId, ref: 'User',     required: true, index: true },
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    vendorId:   { type: Schema.Types.ObjectId, ref: 'VendorProfile', default: null, index: true },
    vendorRole: { type: String, default: null },
    status: {
      type:    String,
      enum:    Object.values(BusinessMemberStatus),
      default: BusinessMemberStatus.ACTIVE,
      index:   true,
    },
    memberType: {
      type:    String,
      enum:    BUSINESS_MEMBER_TYPES,
      default: 'STAFF',
    },
    role:               { type: String,  default: null },
    isDefaultBusiness:  { type: Boolean, default: false },
    joinedAt:           { type: Date,    default: Date.now },
    invitedBy:          { type: Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted:          { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

// Was {userId, businessId} unique — that made it impossible for one user
// to hold TWO memberships under the same business (e.g. business employee
// AND separately staff at a vendor under that business, or staff at two
// different vendors under the same business). Now unique per
// (userId, businessId, vendorId) — vendorId is null for a direct
// business-level membership, so that case is unaffected; vendor-staff
// memberships are now distinguishable from each other and from a general
// business hire.
BusinessMemberSchema.index({ userId: 1, businessId: 1, vendorId: 1 }, { unique: true });
BusinessMemberSchema.index({ businessId: 1, status: 1 });
BusinessMemberSchema.index({ vendorId: 1, status: 1 });

const BusinessMember: Model<IBusinessMember> =
  mongoose.models.BusinessMember ||
  mongoose.model<IBusinessMember>('BusinessMember', BusinessMemberSchema);

export default BusinessMember;
