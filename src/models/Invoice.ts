import mongoose from "mongoose";

const InvoiceItemSchema = new mongoose.Schema(
  {
    productId: String,
    name: String,
    hsn: String,
    qty: Number,
    price: Number,
    discount: Number,
    taxableValue: Number,
    gstPercent: Number,
    cgst: Number,
    sgst: Number,
    igst: Number,
    total: Number,
  },
  { _id: false }
);

const InvoiceSchema = new mongoose.Schema(
  {
    businessId: {
      type: String,
      required: true,
      index: true,
    },

    orderId: {
      type: String, // 🔥 FIXED
      // Was also `index: true` here -- redundant with the unique index
      // this field already gets from InvoiceSchema.index({orderId:1},
      // {unique:true}) below, which additionally enforces uniqueness (the
      // real reason that explicit call exists, not just plain --
      // must stay, so removed the plain flag here instead).
      required: true,
    },

    invoiceNumber: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },

    invoiceType: {
      type: String,
      enum: ["TAX", "B2B", "B2C"], // 🔥 FIXED
      default: "TAX",
    },

    gstMode: {
      type: String,
      enum: ["CGST_SGST", "IGST", "INCLUSIVE"], // 🔥 NEW (CRITICAL)
      default: "INCLUSIVE",
    },

    financialYear: String,

    customer: {
      name: String,
      phone: String,
      email: String,
      gstNumber: String,
      address: String,
      city: String,
      state: String,
      pincode: String,
    },

    items: [InvoiceItemSchema],

    subtotal: Number,
    discount: Number,
    taxableAmount: Number,

    cgst: Number,
    sgst: Number,
    igst: Number,

    grandTotal: Number,

    paymentStatus: {
      type: String,
      enum: ["PENDING", "PAID", "FAILED", "PARTIAL"],
      default: "PENDING",
    },

    status: {
      type: String,
      enum: ["GENERATED", "LOCKED", "CANCELLED"],
      default: "GENERATED",
    },

    generatedAt: {
      type: Date,
      default: Date.now,
    },

    locked: {
      type: Boolean,
      default: true,
    },

    pdfUrl: String,

    irn: String,
    ackNo: String,
    ackDate: Date,

    /* ================= AUDIT LAYER (NEW) ================= */
    audit: {
      createdBy: String,
      source: String, // AUTO_ORDER_SUCCESS / MANUAL / API
      ip: String,
      userAgent: String,
    },
  },
  {
    timestamps: true,
  }
);

/* ================= STRONG IDENTITY LOCK (CRITICAL) ================= */
InvoiceSchema.index({ orderId: 1 }, { unique: true });

export default mongoose.models.Invoice ||
  mongoose.model("Invoice", InvoiceSchema);
