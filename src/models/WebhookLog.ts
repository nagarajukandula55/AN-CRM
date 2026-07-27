import mongoose from "mongoose";

const WebhookLogSchema =
  new mongoose.Schema(
    {
      event: String,
      payload: Object,
      signature: String,
      processed: Boolean,
      createdAt: {
        type: Date,
        default: Date.now,
      },
    },
    {
      timestamps: true,
    }
  );

export default
  mongoose.models.WebhookLog ||
  mongoose.model(
    "WebhookLog",
    WebhookLogSchema
  );
