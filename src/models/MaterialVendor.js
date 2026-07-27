import mongoose from "mongoose";

const MaterialVendorSchema =
new mongoose.Schema(
{
  materialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Material",
    required: true,
  },

  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vendor",
    required: true,
  },

  vendorMaterialCode: String,

  preferredVendor: {
    type: Boolean,
    default: false,
  },

  leadTimeDays: {
    type: Number,
    default: 0,
  },

  minimumOrderQty: {
    type: Number,
    default: 0,
  },

  currentPrice: {
    type: Number,
    default: 0,
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

export default mongoose.models.MaterialVendor ||
mongoose.model(
  "MaterialVendor",
  MaterialVendorSchema
);
