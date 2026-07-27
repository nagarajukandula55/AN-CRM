import mongoose from "mongoose";

const PaymentSchema =
  new mongoose.Schema(
    {
      businessId: {
        type: String,
        index: true,
      },

      orderId: {
        type: String,
        index: true,
      },

      invoiceId: {
        type: String,
        index: true,
      },

      method: String,

      status: String,

      amount: Number,

      utr: String,

      gateway: String,

      gatewayOrderId: String,

      gatewayPaymentId: String,

      paidAt: Date,
    },
    {
      timestamps: true,
    }
  );

export default
  mongoose.models.Payment ||
  mongoose.model(
    "Payment",
    PaymentSchema
  );
