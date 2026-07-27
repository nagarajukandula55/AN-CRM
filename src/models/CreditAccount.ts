import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * A Distributor or Retailer that a vendor extends credit to (sells now,
 * collects payment later, up to creditDays) — the vendor's own downstream
 * B2B customer, not to be confused with VendorProfile.creditLimit/
 * paymentTerms (that's credit AN Group/the business extends TO the vendor,
 * the opposite direction).
 *
 * Doubles as the login identity for the B2B ordering portal (/b2b/[vendorId])
 * -- passwordHash + status cover both paths that create one: a vendor
 * adding a known partner directly (status ACTIVE immediately) and a partner
 * self-signing-up through the public portal (status PENDING until the
 * vendor approves them, so credit terms are always vendor-set, never
 * self-assigned).
 *
 * outstandingBalance is a denormalized running total, kept in sync by
 * every CreditTransaction write (see that model/route) rather than summed
 * on every read — cheap to keep correct since all writes go through one
 * route, and every list/dashboard view needs it constantly.
 */
export interface ICreditAccount extends Document {
  businessId: mongoose.Types.ObjectId;
  vendorId: mongoose.Types.ObjectId;
  name: string;
  type: "DISTRIBUTOR" | "RETAILER";
  contactPerson?: string;
  phone?: string;
  email?: string;
  passwordHash?: string;
  status: "PENDING" | "ACTIVE" | "REJECTED" | "SUSPENDED";
  creditLimit: number;
  creditDays: number;
  outstandingBalance: number;
  isActive: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CreditAccountSchema = new Schema<ICreditAccount>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "VendorProfile", required: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["DISTRIBUTOR", "RETAILER"], required: true },
    contactPerson: String,
    phone: String,
    email: { type: String, lowercase: true, trim: true },
    passwordHash: { type: String, select: false },
    // Accounts a vendor creates directly (from /vendor/credits) start
    // ACTIVE -- the vendor already knows and trusts them. Accounts created
    // via public self-signup (/b2b/[vendorId]/signup) start PENDING; only
    // the vendor's own Approve action (which also sets creditLimit/
    // creditDays) moves them to ACTIVE, so a stranger can never grant
    // themselves credit terms.
    status: { type: String, enum: ["PENDING", "ACTIVE", "REJECTED", "SUSPENDED"], default: "ACTIVE" },
    creditLimit: { type: Number, default: 0, min: 0 },
    // 15 days -- the standard credit period this vendor extends to a
    // Distributor/Retailer, per explicit direction.
    creditDays: { type: Number, default: 15, min: 0 },
    outstandingBalance: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    notes: String,
  },
  { timestamps: true }
);

CreditAccountSchema.index({ vendorId: 1, isActive: 1 });
CreditAccountSchema.index({ vendorId: 1, email: 1 }, { unique: true, sparse: true });

const CreditAccount: Model<ICreditAccount> =
  mongoose.models.CreditAccount || mongoose.model<ICreditAccount>("CreditAccount", CreditAccountSchema);

export default CreditAccount;
