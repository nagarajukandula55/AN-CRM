import mongoose from "mongoose";

const MaterialPriceSchema = new mongoose.Schema(
  {
    materialId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Material",
      required: true,
      index: true,
    },

    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
    },

    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
    },

    currentPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    expectedPrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    worstCasePrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    averagePrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    lowestPrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    highestPrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    priceUnit: {
      type: String,
      default: "KG",
    },

    isPreferredVendor: {
      type: Boolean,
      default: false,
    },

    remarks: {
      type: String,
      default: "",
    },

    effectiveDate: {
      type: Date,
      default: Date.now,
    },

    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

MaterialPriceSchema.index({
  materialId: 1,
  vendorId: 1,
  effectiveDate: -1,
});

export default mongoose.models.MaterialPrice ||
  mongoose.model("MaterialPrice", MaterialPriceSchema);
