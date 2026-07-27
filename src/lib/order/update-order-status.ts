import Order from "@/models/Order";

import { canTransitionStatus } from "./order-status";

interface UpdateOrderStatusParams {
  orderId: string;

  newStatus: string;

  by?: string;

  note?: string;
}

export async function updateOrderStatus({
  orderId,
  newStatus,
  by = "SYSTEM",
  note = "",
}: UpdateOrderStatusParams) {
  const order = await Order.findOne({
    orderId,
  });

  if (!order) {
    throw new Error("Order not found");
  }

  const currentStatus = order.status;

  const allowed = canTransitionStatus(
    currentStatus,
    newStatus
  );

  if (!allowed) {
    throw new Error(
      `Invalid status transition from ${currentStatus} → ${newStatus}`
    );
  }

  /* =========================================
     STATUS HISTORY
  ========================================= */

  if (!order.statusHistory) {
    order.statusHistory = [];
  }

  order.statusHistory.push({
    from: currentStatus,
    to: newStatus,
    by,
    at: new Date(),
  });

  /* =========================================
     TIMELINE
  ========================================= */

  if (!order.timeline) {
    order.timeline = [];
  }

  order.timeline.push({
    status: newStatus,
    note:
      note ||
      `Order moved to ${newStatus}`,
    by,
    role: "ADMIN",
    at: new Date(),
  });

  /* =========================================
     EVENTS
  ========================================= */

  order.events.push({
    type: "STATUS_UPDATED",
    message: `Status changed from ${currentStatus} to ${newStatus}`,
    by,
    data: {
      from: currentStatus,
      to: newStatus,
    },
    createdAt: new Date(),
  });

  /* =========================================
     AUTO TIMESTAMPS
  ========================================= */

  if (newStatus === "DISPATCHED") {
    order.shipping = {
      ...order.shipping,
      shippedAt: new Date(),
    };
  }

  if (newStatus === "DELIVERED") {
    order.shipping = {
      ...order.shipping,
      deliveredAt: new Date(),
    };
  }

  /* =========================================
     MAIN STATUS
  ========================================= */

  order.status = newStatus;

  await order.save();

  return {
    success: true,
    order,
  };
}
