import mongoose, { Document, Model, Schema, Types } from "mongoose";
import { syncRecordToCentralApi, deleteRecordFromCentralApi } from "@/lib/centralApiSync";

/* =========================================================
 * ENUMS
 * =======================================================*/

export enum UserRoleLegacy {
  SUPER_ADMIN = "SUPER_ADMIN",
  ADMIN = "ADMIN",
  STAFF = "STAFF",
  CUSTOMER = "CUSTOMER",
  // Was missing entirely -- every route that creates a vendor login sets
  // role: "VENDOR" (register/vendor, vendors/apply, vendors/[id]/finalize,
  // admin/users, admin/vendor-staff, etc.), but Mongoose's enum validator
  // rejected it outright, so every one of those vendor-creation paths was
  // silently failing with a ValidationError.
  VENDOR = "VENDOR",
}

export enum AuthProvider {
  CREDENTIALS = "credentials",
  GOOGLE = "google",
  MICROSOFT = "microsoft",
  SSO = "sso",
}

/* =========================================================
 * BUSINESS ACCESS (Legacy - Temporary)
 * =======================================================*/

export interface IUserBusinessAccess {
  businessId: string;
  accessKeys: string[];
  isActive: boolean;
}

/* =========================================================
 * USER DOCUMENT
 * =======================================================*/

export interface IUser extends Document {
  /* Identity */
  name: string;
  email: string;
  username?: string;
  phone?: string;
  password?: string;

  avatar?: string;

  authProvider: AuthProvider;

  isActive: boolean;
  isEmailVerified: boolean;

  /* Legacy (kept for compatibility) */
  role: UserRoleLegacy;

  /* Legacy (kept until BusinessMember migration) */
  businessAccess: IUserBusinessAccess[];

  /** Where this account registered from, e.g. "shopnative", "angroup" --
   * matched against SsoSourceMapping.sourceLabel at registration time and
   * never changed after. Free string, not an enum: the mapping is
   * admin-editable so new sources can be added without a schema change. */
  registrationSource?: string;

  /** Storefront customer type -- RETAIL is a normal customer paying listed
   * prices; BUSINESS is a retailer/wholesaler eligible for bulk orders
   * (>=10kg), which get revised pricing + separate shipping shared after
   * submission instead of paying at checkout (see Order.isBulkOrder). */
  accountType?: "RETAIL" | "BUSINESS";
  businessName?: string;
  gstNumber?: string;

  /* Default Context */
  defaultOrganizationId?: Types.ObjectId;
  defaultBusinessId?: Types.ObjectId;

  /* Security */
  failedLoginAttempts: number;
  lockUntil?: Date;
  passwordChangedAt?: Date;
  lastLogin?: Date;
  /** Set when a super admin resets/generates this user's password (or on
   * first-ever account creation) — forces the change-password gate before
   * any other request succeeds. Cleared by /api/auth/change-password. */
  mustChangePassword: boolean;
  /** Bumped on every successful login; embedded in the issued JWT and
   * checked on every request (see session-enriched.ts). A mismatch means
   * this token is from a previous login elsewhere -- single active
   * session per user. */
  sessionVersion: number;
  /** sha256 hash of the raw reset token (see api/auth/reset-password/request) — never the raw token itself. */
  resetPasswordTokenHash?: string;
  resetPasswordExpires?: Date;

  /* Soft Delete */
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

/* =========================================================
 * SCHEMA
 * =======================================================*/

const UserSchema = new Schema<IUser>(
  {
    /* ================= Identity ================= */

    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    username: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      index: true,
      // No `default: null` — MongoDB's sparse index only skips a document
      // where this field is genuinely ABSENT. An explicit null is still
      // indexed, so a default of null meant every user created without a
      // username collided with every other one on that shared null value.
      // Every creation path must now supply a real value (see
      // lib/auth/generateUserId.ts) instead of relying on a default.
    },

    phone: {
      type: String,
      trim: true,
      default: null,
    },

    password: {
      type: String,
      select: false,
    },

    avatar: {
      type: String,
      default: null,
    },

    authProvider: {
      type: String,
      enum: Object.values(AuthProvider),
      default: AuthProvider.CREDENTIALS,
      index: true,
    },

    /* ================= Status ================= */

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    /* ================= Legacy Role ================= */

    role: {
      type: String,
      enum: Object.values(UserRoleLegacy),
      default: UserRoleLegacy.CUSTOMER,
    },

    accountType: {
      type: String,
      enum: ["RETAIL", "BUSINESS"],
      default: "RETAIL",
    },
    businessName: { type: String },
    gstNumber: { type: String },

    /* ================= Legacy Business Access ================= */

    businessAccess: [
      {
        businessId: {
          type: String,
          required: true,
        },

        accessKeys: {
          type: [String],
          default: [],
        },

        isActive: {
          type: Boolean,
          default: true,
        },
      },
    ],

    registrationSource: {
      type: String,
      default: null,
    },

    /* ================= Default Context ================= */

    defaultOrganizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },

    defaultBusinessId: {
      type: Schema.Types.ObjectId,
      ref: "Business",
      default: null,
      index: true,
    },

    /* ================= Security ================= */

    failedLoginAttempts: {
      type: Number,
      default: 0,
    },

    lockUntil: {
      type: Date,
      default: null,
    },

    passwordChangedAt: {
      type: Date,
      default: null,
    },

    lastLogin: {
      type: Date,
      default: null,
    },

    mustChangePassword: {
      type: Boolean,
      default: false,
    },

    sessionVersion: {
      type: Number,
      default: 0,
    },

    // Was missing entirely -- api/auth/reset-password/request+confirm set
    // and query these, but since Mongoose defaults to strict schemas, an
    // undeclared field silently never persists on .save(), which made the
    // whole password-reset flow a no-op (token "saved" but never actually
    // written, so the confirm step could never find it). select: false
    // since the hash shouldn't come back on normal user queries, same
    // pattern as `password` above.
    resetPasswordTokenHash: {
      type: String,
      select: false,
      default: null,
    },

    resetPasswordExpires: {
      type: Date,
      select: false,
      default: null,
    },

    /* ================= Soft Delete ================= */

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    deletedAt: {
      type: Date,
      default: null,
    },

    deletedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/* =========================================================
 * INDEXES
 * =======================================================*/

// email, username, isActive, defaultBusinessId, and defaultOrganizationId
// all already get an index via `index: true` on their own field
// definitions above -- the explicit .index() calls that used to be here for
// all of them were exact duplicates and triggered Mongoose's "duplicate
// schema index" warning at startup. phone has no field-level index, so its
// call is the only one that was ever doing real work.
UserSchema.index({ phone: 1 });

/* =========================================================
 * VIRTUALS
 * =======================================================*/

UserSchema.virtual("isLocked").get(function (this: IUser) {
  return !!(this.lockUntil && this.lockUntil > new Date());
});

/* =========================================================
 * MODEL
 * =======================================================*/

/* =========================================================
 * CENTRAL-API SYNC (dual write, see src/lib/centralApiSync.ts)
 * =======================================================*/

// Never sync raw auth secrets to a third system -- explicit WHITELIST
// (not the usual doc.toObject() used for every other model) of only the
// fields a cross-app "who exists, and what are they" directory actually
// needs. password/resetPasswordTokenHash/resetPasswordExpires/
// sessionVersion/failedLoginAttempts/lockUntil/mustChangePassword are
// intentionally NEVER included -- central-api's "users" dataset is a
// read-only DIRECTORY for cross-app visibility, not an auth backend, and
// this app's own login stays the sole place that ever checks a password.
// vendorId/parentVendorId are resolved via a VendorProfile lookup (User has
// no such field itself) so the directory shows, for anyone who's a vendor
// or sub-vendor login, which business/vendor/parent-vendor they belong to.
export async function buildCentralApiPayload(doc: IUser) {
  const VendorProfile = (await import("@/models/VendorProfile")).default;
  const vendor = await VendorProfile.findOne({ userId: doc._id }).select("businessId vendorId parentVendorId").lean();

  return {
    name: doc.name,
    email: doc.email,
    username: doc.username,
    phone: doc.phone,
    avatar: doc.avatar,
    authProvider: doc.authProvider,
    isActive: doc.isActive,
    isEmailVerified: doc.isEmailVerified,
    role: doc.role,
    accountType: doc.accountType,
    businessName: doc.businessName,
    registrationSource: doc.registrationSource,
    defaultBusinessId: doc.defaultBusinessId,
    // Set only when this login belongs to a Business (not a vendor/
    // sub-vendor/pure-customer) -- i.e. an owner/staff account with no
    // VendorProfile of their own. Vendor logins get businessId from the
    // vendor lookup below instead, since a vendor's own businessId is the
    // business they operate under, more specific than defaultBusinessId.
    businessId: vendor ? (vendor as any).businessId : doc.defaultBusinessId,
    vendorId: (vendor as any)?._id || null,
    vendorCode: (vendor as any)?.vendorId || null,
    parentVendorId: (vendor as any)?.parentVendorId || null,
    lastLogin: doc.lastLogin,
    isDeleted: doc.isDeleted,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

UserSchema.post("save", async function (doc) {
  await syncRecordToCentralApi("users", doc._id.toString(), await buildCentralApiPayload(doc));
});

UserSchema.post("findOneAndUpdate", async function (doc) {
  if (doc) await syncRecordToCentralApi("users", doc._id.toString(), await buildCentralApiPayload(doc));
});

UserSchema.post("findOneAndDelete", async function (doc) {
  if (doc) await deleteRecordFromCentralApi("users", doc._id.toString());
});

const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);

export default User;
