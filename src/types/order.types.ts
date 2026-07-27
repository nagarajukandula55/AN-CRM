export type CartBaseItem = {
  productId: string;
  productKey: string;
  name: string;
  qty: number;
  sellingPrice: number;
  gstRate: number;
  baseTotal: number;
  weightKg?: number;
};

export type CartWithDiscount = CartBaseItem & {
  discount: number;
  taxableValue: number;
};

export type CartWithGST = CartWithDiscount & {
  gstAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  lineTotal: number;
};
