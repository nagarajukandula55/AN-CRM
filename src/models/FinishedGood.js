import mongoose from "mongoose";

const FinishedGoodSchema =
new mongoose.Schema(
{
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true,
  },

  fgCode: {
    type: String,
    required: true,
    unique: true,
  },

  fgName: {
    type: String,
    required: true,
  },

  displayName: String,

  slug: {
    type: String,
    unique: true,
  },

  brand: String,

  category: String,

  subCategory: String,

  status: {
    type: String,
    enum: [
      "DRAFT",
      "REVIEW",
      "APPROVED",
      "PUBLISHED",
      "DISCONTINUED",
    ],
    default: "DRAFT",
  },

  description: String,

  shortDescription: String,

  active: {
    type: Boolean,
    default: true,
  },
},
{
  timestamps: true,
}
);

export default mongoose.models.FinishedGood ||
mongoose.model(
  "FinishedGood",
  FinishedGoodSchema
);
