import mongoose from "mongoose";

const ProductVariantSchema =
  new mongoose.Schema(
    {
      companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Company",
      },

      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true,
        index: true,
      },

      variantCode: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true,
      },

      variantName: {
        type: String,
        required: true,
        trim: true,
      },

      sku: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true,
      },

      slug: {
          type: String,
          unique: true,
          lowercase: true,
          trim: true,
        },

      barcode: {
        type: String,
        trim: true,
      },

      unit: {
        type: String,
        required: true,
      },

      packSize: {
        type: Number,
        default: 1,
      },

      netWeight: {
        type: Number,
        default: 0,
      },

      grossWeight: {
        type: Number,
        default: 0,
      },

      mrp: {
        type: Number,
        default: 0,
      },

      sellingPrice: {
        type: Number,
        default: 0,
      },

      currentCost: {
        type: Number,
        default: 0,
      },

      safeCost: {
        type: Number,
        default: 0,
      },

      worstCaseCost: {
        type: Number,
        default: 0,
      },

      minimumSellingPrice: {
        type: Number,
        default: 0,
      },

      reorderLevel: {
        type: Number,
        default: 0,
      },

      reorderQuantity: {
        type: Number,
        default: 0,
      },

      shelfLifeDays: {
        type: Number,
        default: 0,
      },

      bomId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "BOM",
      },

      images: [String],

      active: {
        type: Boolean,
        default: true,
      },

      status: {
        type: String,
        enum: [
          "DRAFT",
          "ACTIVE",
          "INACTIVE",
        ],
        default: "DRAFT",
      },
    },
    {
      timestamps: true,
    }
  );

ProductVariantSchema.index({
  productId: 1,
  variantCode: 1,
});

export default mongoose.models.ProductVariant ||
  mongoose.model(
    "ProductVariant",
    ProductVariantSchema
  );
