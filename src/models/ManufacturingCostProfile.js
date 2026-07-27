import mongoose from "mongoose";

const ManufacturingCostProfileSchema =
  new mongoose.Schema(
    {
      companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Company",
      },

      warehouseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Warehouse",
      },

      labourPercent: {
        type: Number,
        default: 0,
      },

      utilityPercent: {
        type: Number,
        default: 0,
      },

      overheadPercent: {
        type: Number,
        default: 0,
      },
    },
    {
      timestamps: true,
    }
  );

export default mongoose.models
  .ManufacturingCostProfile ||
  mongoose.model(
    "ManufacturingCostProfile",
    ManufacturingCostProfileSchema
  );
