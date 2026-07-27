import mongoose from "mongoose";

/* ================= NUTRITION ================= */

const NutritionSchema = new mongoose.Schema(
{
  energy: Number,
  protein: Number,
  carbs: Number,
  fat: Number,
  fiber: Number,
  sugar: Number,
  sodium: Number,
  calcium: Number,
  iron: Number,
},
{
  _id: false,
}
);

/* ================= PRODUCT ================= */

const ProductSchema = new mongoose.Schema(
{
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
  },

  productCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },

  productName: {
    type: String,
    required: true,
    trim: true,
  },

  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },

  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ProductCategory",
    required: true,
  },

  brandId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Brand",
  },

  // Which vendor's approved submission this product came from -- was never
  // stamped anywhere, so the internal catalog had no way to trace a
  // product back to the vendor who supplied it. Optional since a
  // super-admin-created product (not via the vendor wizard) has no vendor.
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "VendorProfile",
    index: true,
  },

  shortDescription: String,

  description: String,

  images: [String],

  /* Manufacturing */

  bomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "BOM",
  },

  /* Tax */

  hsnCode: String,

  gstRate: {
    type: Number,
    default: 0,
  },

  /* Nutrition */

  nutrition: {
    type: NutritionSchema,
    default: {},
  },

  /* Pricing Strategy */

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

  /* SEO */

  seo: {
    title: String,
    description: String,
    slug: {
      type: String,
      unique: true,
      index: true,
    },
    keywords: [String],
  },

  /* Status */

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

export default mongoose.models.Product ||
mongoose.model("Product", ProductSchema);
