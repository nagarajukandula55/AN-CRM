import mongoose, { Document, Model, Schema, Types } from "mongoose";

export interface IChatRoom extends Document {
  name: string;
  type: "DIRECT" | "CHANNEL" | "BUSINESS";
  description?: string;
  members: Types.ObjectId[];
  businessId?: Types.ObjectId;
  createdBy: Types.ObjectId;
  isActive: boolean;
  lastMessageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IChatMessage extends Document {
  roomId: Types.ObjectId;
  senderId: Types.ObjectId;
  senderName: string;
  content: string;
  type: "TEXT" | "FILE" | "IMAGE" | "SYSTEM";
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  replyTo?: Types.ObjectId;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ChatRoomSchema = new Schema<IChatRoom>(
  {
    name: { type: String, required: true },
    type: { type: String, enum: ["DIRECT", "CHANNEL", "BUSINESS"], default: "CHANNEL" },
    description: String,
    members: [{ type: Schema.Types.ObjectId, ref: "User" }],
    businessId: { type: Schema.Types.ObjectId, ref: "Business" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    isActive: { type: Boolean, default: true },
    lastMessageAt: Date,
  },
  { timestamps: true, versionKey: false }
);

const ChatMessageSchema = new Schema<IChatMessage>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "ChatRoom", required: true, index: true },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    senderName: { type: String, required: true },
    content: { type: String, required: true },
    type: { type: String, enum: ["TEXT", "FILE", "IMAGE", "SYSTEM"], default: "TEXT" },
    fileUrl: String,
    fileName: String,
    fileSize: Number,
    replyTo: { type: Schema.Types.ObjectId, ref: "ChatMessage" },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

ChatMessageSchema.index({ roomId: 1, createdAt: -1 });

export const ChatRoom: Model<IChatRoom> =
  mongoose.models.ChatRoom || mongoose.model<IChatRoom>("ChatRoom", ChatRoomSchema);

export const ChatMessage: Model<IChatMessage> =
  mongoose.models.ChatMessage || mongoose.model<IChatMessage>("ChatMessage", ChatMessageSchema);
