import mongoose from "mongoose";

const VendorCatalogSchema =
  new mongoose.Schema(
    {
      businessId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Business",
      },

      vendorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Vendor",
        required: true,
        index: true,
      },

      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true,
        index: true,
      },

      variantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ProductVariant",
        required: true,
        index: true,
      },

      vendorProductId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "VendorProduct",
      },

      vendorSku: String,

      vendorCost: {
        type: Number,
        default: 0,
      },

      minimumOrderQty: {
        type: Number,
        default: 1,
      },

      leadTimeDays: {
        type: Number,
        default: 0,
      },

      availableStock: {
        type: Number,
        default: 0,
      },

      priority: {
        type: Number,
        default: 1,
      },

      preferredVendor: {
        type: Boolean,
        default: false,
      },

      status: {
        type: String,
        enum: [
          "ACTIVE",
          "INACTIVE",
          "BLOCKED",
        ],
        default: "ACTIVE",
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

VendorCatalogSchema.index({
  vendorId: 1,
  productId: 1,
  variantId: 1,
});

VendorCatalogSchema.index({
  productId: 1,
  variantId: 1,
});

export default
  mongoose.models.VendorCatalog ||
  mongoose.model(
    "VendorCatalog",
    VendorCatalogSchema
  );
