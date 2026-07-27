import { Types } from "mongoose";

export interface IBaseDocument {
  _id: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;

  createdBy?: Types.ObjectId | null;
  updatedBy?: Types.ObjectId | null;

  isDeleted?: boolean;
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null;
}
