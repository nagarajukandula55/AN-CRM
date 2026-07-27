import { shiprocketRequest } from "./shiprocket";
import Order from "@/models/Order";

export async function requestPickup(orderId: string) {
  const order = await Order.findOne({ orderId });

  if (!order) {
    throw new Error("Order not found");
  }

  if (!order.shipping?.shipmentId) {
    throw new Error("Shipment not found");
  }

  const response = await shiprocketRequest(
    "/courier/generate/pickup",
    {
      method: "POST",
      body: JSON.stringify({
        shipment_id: [order.shipping.shipmentId],
      }),
    }
  );

  if (!response?.pickup_status) {
    throw new Error("Pickup request failed");
  }

  // Save pickup info in DB
  order.shipping = {
    ...order.shipping,
    pickupStatus: response?.pickup_status,
    pickupToken: response?.pickup_token || null,
    pickupRequestedAt: new Date(),
  };

  if (!order.events) order.events = [];

  order.events.push({
    type: "PICKUP_REQUESTED",
    data: {
      shipmentId: order.shipping.shipmentId,
      pickupStatus: response?.pickup_status,
    },
    at: new Date(),
  });

  order.status = "READY_FOR_PICKUP";

  await order.save();

  return {
    success: true,
    orderId: order.orderId,
    pickupStatus: response?.pickup_status,
    data: response,
  };
}
