import { Schema } from "mongoose";

/**
 * Optional plugin version (future use for advanced schemas)
 */
export function basePlugin(schema: Schema): void {
  schema.add({
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  });
}
