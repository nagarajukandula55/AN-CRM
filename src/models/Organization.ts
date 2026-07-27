import mongoose, { Document, Model, Schema, Types } from "mongoose";

/* =========================================================
   ORGANIZATION DOCUMENT (FINAL VERSION)
========================================================= */

export interface IOrganization extends Document {
  name: string;
  code: string; // HUMAN CODE (AN0001)

  legalName?: string;

  email?: string;
  phone?: string;
  website?: string;

  logo?: string;

  gstNumber?: string;
  panNumber?: string;

  addressLine1?: string;
  addressLine2?: string;

  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;

  ownerId?: Types.ObjectId;

  /* ================= NEW SAAS + ERP FIELDS ================= */

  sysCode: string; // INTERNAL UNIQUE ID (org_xxx)

  slug: string; // URL SAFE IDENTIFIER (an-group)

  timezone: string; // ERP TIME CONSISTENCY
  currency: string; // FINANCIAL MODULE SUPPORT

  plan?: "FREE" | "BASIC" | "PRO" | "ENTERPRISE";

  features?: {
    inventory?: boolean;
    purchase?: boolean;
    sales?: boolean;
    finance?: boolean;
    production?: boolean;
    crm?: boolean;
  };

  primaryColor?: string;
  secondaryColor?: string;

  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;

  isActive: boolean;
  isDeleted: boolean;

  deletedAt?: Date;
  deletedBy?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

/* =========================================================
   SCHEMA
========================================================= */

const OrganizationSchema = new Schema<IOrganization>(
  {
    /* ================= CORE IDENTITY ================= */

    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    code: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      unique: true,
      index: true,
    },

    sysCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
    },

    /* ================= LEGAL ================= */

    legalName: { type: String, default: null, trim: true },
    email: { type: String, default: null, lowercase: true, trim: true },
    phone: { type: String, default: null, trim: true },
    website: { type: String, default: null, trim: true },
    logo: { type: String, default: null },

    gstNumber: { type: String, default: null, trim: true },
    panNumber: { type: String, default: null, trim: true },

    /* ================= ADDRESS ================= */

    addressLine1: { type: String, default: null },
    addressLine2: { type: String, default: null },
    city: { type: String, default: null },
    state: { type: String, default: null },
    country: { type: String, default: "India" },
    postalCode: { type: String, default: null },

    /* ================= OWNERSHIP ================= */

    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    /* ================= SAAS CONFIG ================= */

    timezone: {
      type: String,
      default: "Asia/Kolkata",
    },

    currency: {
      type: String,
      default: "INR",
    },

    plan: {
      type: String,
      enum: ["FREE", "BASIC", "PRO", "ENTERPRISE"],
      default: "FREE",
    },

    features: {
      inventory: { type: Boolean, default: true },
      purchase: { type: Boolean, default: true },
      sales: { type: Boolean, default: true },
      finance: { type: Boolean, default: true },
      production: { type: Boolean, default: true },
      crm: { type: Boolean, default: true },
    },

    /* ================= BRANDING ================= */

    primaryColor: { type: String, default: null },
    secondaryColor: { type: String, default: null },

    /* ================= AUDIT ================= */

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    /* ================= STATUS ================= */

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

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
   INDEXES
========================================================= */

// name, code, sysCode, slug, and isActive all already get an index via
// `index: true` (code/sysCode/slug also `unique: true`) on their own field
// definitions above -- name/sysCode/slug/isActive each had a redundant
// explicit .index() call here too, all exact duplicates triggering
// Mongoose's "duplicate schema index" warning at startup.

/* =========================================================
   MODEL
========================================================= */

const Organization: Model<IOrganization> =
  mongoose.models.Organization ||
  mongoose.model<IOrganization>("Organization", OrganizationSchema);

export default Organization;
