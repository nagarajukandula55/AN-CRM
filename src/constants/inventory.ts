export const InventoryTransactionTypes = {
  OPENING: "OPENING",

  PURCHASE: "PURCHASE",
  GRN: "GRN",

  SALE: "SALE",

  RETURN: "RETURN",

  TRANSFER_IN: "TRANSFER_IN",
  TRANSFER_OUT: "TRANSFER_OUT",

  MANUFACTURING_IN: "MANUFACTURING_IN",
  MANUFACTURING_OUT: "MANUFACTURING_OUT",

  RESERVATION: "RESERVATION",
  RESERVATION_RELEASE: "RESERVATION_RELEASE",

  ADJUSTMENT: "ADJUSTMENT",
} as const;

export type InventoryTransactionType =
  typeof InventoryTransactionTypes[keyof typeof InventoryTransactionTypes];
