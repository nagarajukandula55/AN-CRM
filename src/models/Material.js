import mongoose from "mongoose";

const NutritionSchema = new mongoose.Schema(
{
  servingSize: Number,

  energy: Number,
  protein: Number,
  carbs: Number,

  sugars: Number,
  addedSugars: Number,

  fat: Number,
  saturatedFat: Number,
  transFat: Number,

  fiber: Number,

  sodium: Number,
  calcium: Number,
  iron: Number,
  potassium: Number,
},
{
  _id: false,
}
);

const MaterialSchema = new mongoose.Schema(
{
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Business",
    required: true,
  },

  materialCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },

  materialName: {
    type: String,
    required: true,
    trim: true,
  },

  materialShortName: String,

  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "MaterialCategory",
    required: true,
  },

  subCategoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "MaterialCategory",
  },

  materialType: {
    type: String,
    enum: [
      "RAW_MATERIAL",
      "PACKAGING_MATERIAL",
      "CONSUMABLE",
      "LABEL",
      "BOX",
      "SEMI_FINISHED",
      "SERVICE",
    ],
    default: "RAW_MATERIAL",
  },

  // Units

  purchaseUnit: {
    type: String,
    required: true,
  },

  stockUnit: {
    type: String,
    required: true,
  },

  consumptionUnit: {
    type: String,
    required: true,
  },

  conversionFactor: {
    type: Number,
    default: 1,
  },

  // Pricing -- current per-unit (stockUnit) cost, editable by the vendor
  // from /vendor/materials. Every change is also logged to
  // MaterialPriceHistory (businessId/materialId/vendorId/price/priceUnit)
  // so price trends can be tracked across vendors over time, not just the
  // latest value.
  currentPrice: {
    type: Number,
    default: 0,
    min: 0,
  },

  // Tax

  hsnCode: String,

  gstRate: {
    type: Number,
    default: 0,
  },

  countryOfOrigin: {
    type: String,
    default: "India",
  },

  // Inventory

  minimumStock: {
    type: Number,
    default: 0,
  },

  maximumStock: {
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

  storageConditions: String,

  // Procurement

  primaryVendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vendor",
  },

  leadTimeDays: {
    type: Number,
    default: 0,
  },

  minimumOrderQty: {
    type: Number,
    default: 0,
  },

  // Nutrition

  isNutritionalMaterial: {
    type: Boolean,
    default: true,
  },

  nutrition: {
    type: NutritionSchema,
    default: {},
  },

  // Quality

  qualityGrade: String,

  moisturePercentage: Number,

  purityPercentage: Number,

  description: String,

  notes: String,

  active: {
    type: Boolean,
    default: true,
  },
},
{
  timestamps: true,
}
);

export default mongoose.models.Material ||
mongoose.model("Material", MaterialSchema);
