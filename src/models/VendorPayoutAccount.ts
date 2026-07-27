import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * VendorPayoutAccount — a vendor's Razorpay Route "linked account" +
 * ongoing KYC/settlement status, one per VendorProfile. Route is
 * Razorpay's split-payment product: money collected from a customer on a
 * single order can be automatically transferred to each vendor's own
 * linked account at the moment payment is captured, instead of the
 * platform collecting everything and settling vendors manually.
 *
 * This is a genuinely new subsystem (previously Razorpay only handled
 * customer payment collection — see order.service.ts's `razorpay.orders.
 * create()` — with no vendor-side money movement at all). Linked-account
 * creation requires KYC-grade business/bank details Razorpay verifies
 * asynchronously (status starts "created", moves to "activated" once
 * Razorpay approves it) — transfers can only be attempted once activated.
 */
export type PayoutAccountStatus =
  | "NOT_STARTED"   // vendor hasn't submitted payout KYC yet
  | "CREATED"       // linked account created at Razorpay, pending their review
  | "ACTIVATED"     // Razorpay approved — transfers can be attempted
  | "SUSPENDED"     // Razorpay suspended the account (compliance issue etc.)
  | "REJECTED";     // Razorpay rejected the KYC submission

export interface IVendorPayoutAccount extends Document {
  vendorId: mongoose.Types.ObjectId; // ref VendorProfile
  businessId: mongoose.Types.ObjectId;
  razorpayAccountId?: string;   // Razorpay's acc_XXXXXXXX linked account id
  razorpayContactId?: string;
  status: PayoutAccountStatus;
  /** Percentage of the vendor's line-item total the PLATFORM retains as
   * commission before transferring the rest — e.g. 10 means the vendor
   * gets 90% of their line items' value. Configurable per vendor so
   * different commission deals are possible. */
  platformCommissionPercent: number;
  legalBusinessName: string;
  businessType: string; // individual | partnership | private_limited | proprietorship, per Razorpay's enum
  panNumber?: string;
  gstNumber?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  bankBeneficiaryName?: string;
  contactEmail?: string;
  contactPhone?: string;
  rejectionReason?: string;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const VendorPayoutAccountSchema = new Schema<IVendorPayoutAccount>(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: "VendorProfile", required: true, unique: true },
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    razorpayAccountId: { type: String, index: true },
    razorpayContactId: { type: String },
    status: {
      type: String,
      enum: ["NOT_STARTED", "CREATED", "ACTIVATED", "SUSPENDED", "REJECTED"],
      default: "NOT_STARTED",
      index: true,
    },
    platformCommissionPercent: { type: Number, default: 10, min: 0, max: 100 },
    legalBusinessName: { type: String, default: "" },
    businessType: { type: String, default: "individual" },
    panNumber: { type: String },
    gstNumber: { type: String },
    bankAccountNumber: { type: String },
    bankIfsc: { type: String },
    bankBeneficiaryName: { type: String },
    contactEmail: { type: String },
    contactPhone: { type: String },
    rejectionReason: { type: String },
    lastSyncedAt: { type: Date },
  },
  { timestamps: true }
);

const VendorPayoutAccount: Model<IVendorPayoutAccount> =
  mongoose.models.VendorPayoutAccount ||
  mongoose.model<IVendorPayoutAccount>("VendorPayoutAccount", VendorPayoutAccountSchema);

export default VendorPayoutAccount;
