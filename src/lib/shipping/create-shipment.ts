import Order from "@/models/Order";
import { createShiprocketShipment }
from "./create-shiprocket-shipment";

interface ShipmentPayload {
  orderId: string;

  dispatchType: string;

  courierPartner?: string;

  courierId?: string;

  awbNumber?: string;

  trackingUrl?: string;

  by?: string;

  weight?: number;

  length?: number;

  width?: number;

  height?: number;
}

export async function createShipment({
  orderId,
  dispatchType,
  courierPartner,
  courierId,
  awbNumber,
  trackingUrl,
  by = "ADMIN",

  weight,
  length,
  width,
  height,
}: ShipmentPayload) {
  const order = await Order.findOne({
    orderId,
  });

  if (!order) {
    throw new Error("Order not found");
  }

  let shiprocketData = null;

  if (
    dispatchType === "COURIER" &&
    courierId
  ) {
    shiprocketData =
      await createShiprocketShipment(
        orderId,
        courierId
      );
  }

  if (!order.shipping) {
    order.shipping = {};
  }
  
  order.shipping.packageWeight =
    Number(weight || 0.5);
  
  order.shipping.dimensions = {
    length:
      Number(length || 10),
  
    breadth:
      Number(width || 10),
  
    height:
      Number(height || 10),
  };
  
  order.shipping = {
    ...order.shipping,
  
    dispatchType,
  
    courierPartner,
  
    courierId,
  
    trackingUrl,
  
    shipmentId:
      shiprocketData?.shipmentId,
  
    awbNumber:
      shiprocketData?.awb ||
      awbNumber,
  
    labelUrl:
      shiprocketData?.labelUrl,
  
    trackingStatus:
      "CREATED",
  
    shippedAt:
      new Date(),
  };

  order.shipmentCreated = true;

  order.events.push({
    type: "SHIPPED",

    message:
      "Shipment created successfully",

    by,

    data: {
      dispatchType,
      courierPartner,
      awbNumber,
    },

    createdAt: new Date(),
  });

  order.events.push({
    type: "STATUS_CHANGED",
    data: {
      from: order.status,
      to: "DISPATCHED",
      reason: "Shipment Created",
      by,
    },
    at: new Date(),
  });

  order.status = "DISPATCHED";

  await order.save();

  return {
    success: true,
    order,
  };
}
