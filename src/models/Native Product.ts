import mongoose from "mongoose";

const NativeProductSchema = new mongoose.Schema(
  {
    name: String,
    slug: String,

    productKey: {
      type: String,
      index: true,
    },

    category: String,
    brand: String,
    subcategory: String,

    tax: Number,
    hsn: String,

    description: String,
    shortDescription: String,

    primaryImage: String,
    images: [String],

    pricing: {
      sellingPrice: Number,
      mrp: Number,
    },

    primaryVariant: {
      price: Number,
      mrp: Number,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },

    isActive: Boolean,
    isListed: Boolean,
  },
  {
    timestamps: true,
    collection: "products",
  }
);

export const getProductModel = (conn: mongoose.Connection) => {
  return conn.models.Product || conn.model("Product", NativeProductSchema);
};
