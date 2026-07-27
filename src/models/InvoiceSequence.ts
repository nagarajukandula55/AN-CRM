import mongoose from "mongoose";

const InvoiceSequenceSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },

    dateKey: {
      type: String,
      required: true, // YYMMDD → 260430
      index: true,
    },

    sequence: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

/* 🔒 UNIQUE PER BUSINESS + DATE */
InvoiceSequenceSchema.index(
  { businessId: 1, dateKey: 1 },
  { unique: true }
);

export default mongoose.models.InvoiceSequence ||
  mongoose.model("InvoiceSequence", InvoiceSequenceSchema);
