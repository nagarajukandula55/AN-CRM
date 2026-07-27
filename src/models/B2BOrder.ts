import mongoose, { Schema, Document, Model } from "mongoose";

export interface IB2BOrderItem {
  productId: mongoose.Types.ObjectId;
  productName: string;
  vendorSku?: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  marginPercent: number;
  lineTotal: number;
}

/** An order placed through the B2B partner ordering portal (/b2b/[vendorId])
 * by an approved CreditAccount (Distributor/Retailer). Kept as its own
 * model rather than reusing the consumer-facing Order model -- pricing here
 * always comes from the account's own channel tier (see
 * core/pricing/pricingEngine.ts), never the Online/D2C price, and a CREDIT
 * order is tied 1:1 to the CreditTransaction it generated. */
export interface IB2BOrder extends Document {
  businessId: mongoose.Types.ObjectId;
  vendorId: mongoose.Types.ObjectId;
  accountId: mongoose.Types.ObjectId;
  orderNumber: string;
  items: IB2BOrderItem[];
  totalAmount: number;
  paymentMode: "CREDIT" | "PAY_ON_DELIVERY";
  creditTransactionId?: mongoose.Types.ObjectId;
  status: "PENDING" | "CONFIRMED" | "FULFILLED" | "CANCELLED";
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const B2BOrderSchema = new Schema<IB2BOrder>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "VendorProfile", required: true },
    accountId: { type: Schema.Types.ObjectId, ref: "CreditAccount", required: true },
    orderNumber: { type: String, required: true, unique: true },
    items: [
      {
        productId: { type: Schema.Types.ObjectId, ref: "VendorProduct", required: true },
        productName: { type: String, required: true },
        vendorSku: String,
        unit: String,
        quantity: { type: Number, required: true, min: 1 },
        unitPrice: { type: Number, required: true, min: 0 },
        marginPercent: Number,
        lineTotal: { type: Number, required: true, min: 0 },
        _id: false,
      },
    ],
    totalAmount: { type: Number, required: true, min: 0 },
    // No real payment gateway wired up for B2B yet -- PAY_ON_DELIVERY is
    // the placeholder non-credit path (settle offline/on receipt), same
    // "stub until a gateway exists" approach as core/billing/paymentGateway.ts.
    paymentMode: { type: String, enum: ["CREDIT", "PAY_ON_DELIVERY"], required: true },
    creditTransactionId: { type: Schema.Types.ObjectId, ref: "CreditTransaction", default: null },
    status: { type: String, enum: ["PENDING", "CONFIRMED", "FULFILLED", "CANCELLED"], default: "PENDING" },
    notes: String,
  },
  { timestamps: true }
);

B2BOrderSchema.index({ vendorId: 1, createdAt: -1 });
B2BOrderSchema.index({ accountId: 1, createdAt: -1 });

const B2BOrder: Model<IB2BOrder> = mongoose.models.B2BOrder || mongoose.model<IB2BOrder>("B2BOrder", B2BOrderSchema);

export default B2BOrder;
