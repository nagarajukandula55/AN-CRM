import mongoose from "mongoose";

const BOMVersionSchema =
  new mongoose.Schema(
    {
      bomId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "BOM",
        required: true,
      },

      versionNumber: {
        type: Number,
        required: true,
      },

      effectiveFrom: Date,

      effectiveTo: Date,

      remarks: String,

      active: {
        type: Boolean,
        default: true,
      },
    },
    {
      timestamps: true,
    }
  );

export default mongoose.models.BOMVersion ||
  mongoose.model(
    "BOMVersion",
    BOMVersionSchema
  );
