import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IEmployeeProfile extends Document {
  // Optional -- an employee record can exist before a login is linked (a
  // pure HR record), or never get one at all. Denormalized name/email/phone
  // below cover display in that case; when userId IS set, those still act
  // as an editable snapshot rather than requiring a populate() everywhere.
  userId?: mongoose.Types.ObjectId;
  businessId: mongoose.Types.ObjectId;
  employeeId: string;
  name?: string;
  email?: string;
  phone?: string;
  department?: string;
  designation?: string;
  joiningDate?: Date;
  terminationDate?: Date;
  reportingTo?: mongoose.Types.ObjectId;
  salary?: number;
  employmentType: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN';
  status: 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED' | 'INACTIVE';
  bankDetails?: {
    accountName?: string;
    accountNumber?: string;
    ifscCode?: string;
    bankName?: string;
  };
  address?: {
    street?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
  panNumber?: string;
  aadharNumber?: string;
  pfNumber?: string;
  esiNumber?: string;
  notes?: string;
  emergencyContact?: {
    name?: string;
    phone?: string;
    relation?: string;
  };
  documents?: Array<{
    name: string;
    url: string;
    type: string;
  }>;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const EmployeeProfileSchema = new Schema<IEmployeeProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    employeeId: { type: String },
    name: { type: String },
    email: { type: String },
    phone: { type: String },
    department: { type: String },
    designation: { type: String },
    joiningDate: { type: Date },
    terminationDate: { type: Date },
    reportingTo: { type: Schema.Types.ObjectId, ref: 'User' },
    salary: { type: Number },
    employmentType: {
      type: String,
      enum: ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'],
      default: 'FULL_TIME',
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'ON_LEAVE', 'TERMINATED', 'INACTIVE'],
      default: 'ACTIVE',
    },
    bankDetails: {
      accountName: { type: String },
      accountNumber: { type: String },
      ifscCode: { type: String },
      bankName: { type: String },
    },
    address: {
      street: { type: String },
      city: { type: String },
      state: { type: String },
      pincode: { type: String },
    },
    panNumber: { type: String },
    aadharNumber: { type: String },
    pfNumber: { type: String },
    esiNumber: { type: String },
    notes: { type: String },
    emergencyContact: {
      name: { type: String },
      phone: { type: String },
      relation: { type: String },
    },
    documents: [
      {
        name: { type: String },
        url: { type: String },
        type: { type: String },
      },
    ],
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Sparse: an employee with no linked login (userId not set) is excluded
// from this uniqueness constraint entirely, so many such records can
// coexist per business -- only two records both linked to the SAME user
// in the SAME business collide.
EmployeeProfileSchema.index({ businessId: 1, userId: 1 }, { unique: true, sparse: true });

// employeeId was GLOBALLY unique -- two businesses couldn't both have
// "EMP-001". Scoped per-business instead (sparse: some HR-only records may
// have no employeeId assigned yet).
EmployeeProfileSchema.index({ businessId: 1, employeeId: 1 }, { unique: true, sparse: true });

const EmployeeProfile: Model<IEmployeeProfile> =
  mongoose.models.EmployeeProfile ||
  mongoose.model<IEmployeeProfile>('EmployeeProfile', EmployeeProfileSchema);

export default EmployeeProfile;
