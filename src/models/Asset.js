import mongoose from "mongoose";

const AssetSchema = new mongoose.Schema(
  {
    name: String,

    // Was a closed `enum` covering only 6 values, but new upload call
    // sites kept sending categories that were never added to it
    // ("favicon", "vendor-application", "banner", "brand-logo" were all
    // missing) -- every one of those uploads failed Mongoose validation
    // silently-ish (a 500 the frontend usually just showed as "Upload
    // failed"). This is a free-text descriptive/filtering tag, not
    // something that needs strict validation, so it's a plain string with
    // a sensible default instead of a list someone has to remember to
    // extend every time a new upload feature ships.
    category: {
      type: String,
      default: "general",
      trim: true,
    },

    fileUrl: String,

    thumbnailUrl: String,

    fileType: String,

    size: Number,

    tags: [String],
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.Asset ||
  mongoose.model("Asset", AssetSchema);
