import Order from "@/models/Order";
import { shiprocketRequest } from "./shiprocket";

export async function syncTracking(awbNumber: string) {
  const order = await Order.findOne({
    "shipping.awbNumber": awbNumber,
  });

  if (!order) {
    throw new Error("Order not found");
  }

  const response = await shiprocketRequest(
    `/courier/track/awb/${awbNumber}`
  );

  const trackingData = response?.tracking_data;

  // =========================
  // SAFE DEFAULT RESPONSE
  // =========================
  if (!trackingData) {
    return {
      success: true,
      awb: awbNumber,
      orderId: order.orderId,
      trackingStatus: "NOT_AVAILABLE",
      tracking: response,
    };
  }

  const shipmentStatus =
    trackingData?.shipment_status ||
    trackingData?.current_status ||
    "UNKNOWN";

  order.shipping = {
    ...order.shipping,
    trackingStatus: shipmentStatus,
  };

  const statusText = String(shipmentStatus).toUpperCase();

  // =========================
  // SAFE INIT BLOCKS
  // =========================
  if (!order.statusTimeline) {
    order.statusTimeline = {};
  }

  if (!order.events) {
    order.events = [];
  }

  // =========================
  // STATUS MAPPING
  // =========================

  if (statusText.includes("OUT FOR DELIVERY")) {
    order.status = "OUT_FOR_DELIVERY";
    order.statusTimeline.outForDeliveryAt = new Date();
  }

  if (statusText.includes("DELIVERED")) {
    order.status = "DELIVERED";
    order.statusTimeline.deliveredAt = new Date();
  }

  if (
    statusText.includes("IN TRANSIT") ||
    statusText.includes("SHIPPED") ||
    statusText.includes("PICKED")
  ) {
    order.status = "DISPATCHED";
  }

  // =========================
  // SAFE EVENT PUSH
  // =========================
  order.events.push({
    type: "STATUS_CHANGED",
    data: {
      trackingStatus: shipmentStatus,
    },
    at: new Date(),
  });

  await order.save();

  return {
    success: true,
    awb: awbNumber,
    orderId: order.orderId,
    trackingStatus: shipmentStatus,
    tracking: response,
  };
}
