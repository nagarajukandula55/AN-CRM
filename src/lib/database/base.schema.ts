import { Schema } from "mongoose";

/**
 * Adds common audit + soft delete fields to all schemas
 */
export function applyBaseSchema(schema: Schema): void {
  schema.add({
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
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
  });

  schema.set("timestamps", true);
  schema.set("versionKey", false);
}
