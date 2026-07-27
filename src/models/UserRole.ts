import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IUserRole extends Document {
  userId: Types.ObjectId;
  roleId: Types.ObjectId;
  businessId?: Types.ObjectId;
  assignedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const UserRoleSchema = new Schema<IUserRole>(
  {
    userId:     { type: Schema.Types.ObjectId, ref: 'User',     required: true, index: true },
    roleId:     { type: Schema.Types.ObjectId, ref: 'Role',     required: true, index: true },
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', default: null },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User',     default: null },
  },
  { timestamps: true, versionKey: false }
);

UserRoleSchema.index({ userId: 1, roleId: 1 }, { unique: true });

const UserRole: Model<IUserRole> =
  mongoose.models.UserRole || mongoose.model<IUserRole>('UserRole', UserRoleSchema);

export default UserRole;
