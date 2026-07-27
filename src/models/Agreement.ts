import mongoose, { Document, Schema } from 'mongoose';

export interface IParty {
  name: string;
  email?: string;
  role?: string;
  signedAt?: Date;
  signatureData?: string;
  ipAddress?: string;
}

export interface ISignature {
  partyEmail: string;
  partyName: string;
  partyRole?: string;
  signedAt?: Date;
  otp?: string;
  otpExpiry?: Date;
  otpVerified: boolean;
  signatureData?: string;
  ipAddress?: string;
}

export interface IAgreement extends Document {
  businessId: mongoose.Schema.Types.ObjectId;
  createdBy: mongoose.Schema.Types.ObjectId;
  title: string;
  type: 'NDA' | 'EMPLOYMENT' | 'VENDOR' | 'SERVICE' | 'PARTNERSHIP' | 'LEASE' | 'CONSULTANCY' | 'FRANCHISE' | 'MOU' | 'CUSTOM';
  content: string;
  parties: IParty[];
  signatures: ISignature[];
  status: 'DRAFT' | 'SENT' | 'SIGNED' | 'PARTIALLY_SIGNED' | 'DECLINED' | 'EXPIRED' | 'CANCELLED' | 'PENDING_SIGNATURE' | 'FULLY_SIGNED';
  governingLaw: string;
  jurisdiction?: string;
  expiresAt?: Date;
  pdfUrl?: string;
  notes?: string;
  variables?: Record<string, string>;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PartySchema = new Schema<IParty>(
  {
    name: { type: String, required: true },
    email: { type: String },
    role: { type: String },
    signedAt: { type: Date },
    signatureData: { type: String },
    ipAddress: { type: String },
  },
  { _id: false }
);

const SignatureSchema = new Schema<ISignature>(
  {
    partyEmail: { type: String, required: true },
    partyName: { type: String, required: true },
    partyRole: { type: String },
    signedAt: { type: Date },
    otp: { type: String },
    otpExpiry: { type: Date },
    otpVerified: { type: Boolean, default: false },
    signatureData: { type: String },
    ipAddress: { type: String },
  },
  { _id: false }
);

const AgreementSchema = new Schema<IAgreement>(
  {
    businessId: { type: Schema.Types.ObjectId, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    type: {
      type: String,
      enum: ['NDA', 'EMPLOYMENT', 'VENDOR', 'SERVICE', 'PARTNERSHIP', 'LEASE', 'CONSULTANCY', 'FRANCHISE', 'MOU', 'CUSTOM'],
      required: true,
    },
    content: { type: String, required: true },
    parties: { type: [PartySchema], default: [] },
    signatures: { type: [SignatureSchema], default: [] },
    status: {
      type: String,
      enum: ['DRAFT', 'SENT', 'SIGNED', 'PARTIALLY_SIGNED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'PENDING_SIGNATURE', 'FULLY_SIGNED'],
      default: 'DRAFT',
    },
    governingLaw: { type: String, default: 'Laws of India' },
    jurisdiction: { type: String },
    expiresAt: { type: Date },
    pdfUrl: { type: String },
    notes: { type: String },
    variables: { type: Map, of: String, default: {} },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Agreements are always listed per business, newest first.
AgreementSchema.index({ businessId: 1, createdAt: -1 });

export default mongoose.models.Agreement || mongoose.model<IAgreement>('Agreement', AgreementSchema);
