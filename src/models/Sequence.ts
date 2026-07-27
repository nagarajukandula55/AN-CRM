import mongoose from "mongoose";

const SequenceSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },

    documentType: {
      type: String,
      required: true,
      enum: [
        "INVOICE",
        "RECEIPT",
        "PURCHASE_ORDER",
        "GOODS_RECEIPT",
        "SALES_ORDER",
        "PRODUCT",
        "PRODUCT_VARIANT",
        "VENDOR_PRODUCT",
        "STOCK_ADJUSTMENT",
        "STOCK_TRANSFER",
        "PRODUCTION_ORDER",
        "BATCH",
        "CUSTOMER_ORDER",
        "CREDIT_NOTE",
        "DEBIT_NOTE",
      ],
      index: true,
    },

    prefix: {
      type: String,
      required: true,
    },

    financialYear: {
      type: String,
      default: "",
      index: true,
    },

    dateKey: {
      type: String,
      default: "",
    },

    value: {
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

SequenceSchema.index(
  {
    businessId: 1,
    documentType: 1,
    financialYear: 1,
    dateKey: 1,
  },
  {
    unique: true,
  }
);

export default
  mongoose.models.Sequence ||
  mongoose.model("Sequence", SequenceSchema);
