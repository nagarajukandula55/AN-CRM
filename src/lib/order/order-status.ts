export const ORDER_FLOW: Record<
  string,
  string[]
> = {
  CREATED: [
    "PENDING_PAYMENT",
    "CANCELLED",
    "EXPIRED",
  ],

  PENDING_PAYMENT: [
    "PAID",
    "FAILED",
    "EXPIRED",
    "CANCELLED",
  ],

  PAID: [
    "PROCESSING",
    "CANCELLED",
    "REFUNDED",
  ],

  PROCESSING: [
    "PACKED",
    "CANCELLED",
  ],

  PACKED: [
    "DISPATCHED",
  ],

  DISPATCHED: [
    "DELIVERED",
    "RETURNED",
  ],

  DELIVERED: [
    "COMPLETED",
    "RETURNED",
  ],

  RETURNED: [
    "REFUNDED",
  ],
};

export const canTransitionStatus = (
  currentStatus: string,
  newStatus: string
) => {
  const allowed =
    ORDER_FLOW[currentStatus] || [];

  return allowed.includes(newStatus);
};
