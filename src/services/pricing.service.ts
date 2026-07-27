import { money } from "@/utils/money";

import type {
  CartBaseItem,
  CartWithDiscount,
  CartWithGST,
} from "@/types/order.types";

export class PricingService {
  /* =========================================================
     DISCOUNT ENGINE (PROPORTIONAL + ROUND SAFE)
  ========================================================= */
  static applyDiscount(
    items: CartBaseItem[],
    totalDiscount: number
  ): CartWithDiscount[] {
    const subtotal = items.reduce(
      (sum, item) => sum + money(item.baseTotal || 0),
      0
    );

    let distributed = 0;

    return items.map((item, index) => {
      const itemBaseTotal = money(item.baseTotal || 0);

      const ratio = subtotal > 0 ? itemBaseTotal / subtotal : 0;

      let discount =
        index === items.length - 1
          ? money(totalDiscount - distributed)
          : money(totalDiscount * ratio);

      discount = money(Math.max(0, discount));

      if (index !== items.length - 1) {
        distributed = money(distributed + discount);
      }

      const taxableValue = money(itemBaseTotal - discount);

      return {
        ...item,
        discount,
        taxableValue,
      };
    });
  }

  /* =========================================================
     GST ENGINE (ROUND SAFE + SPLIT CORRECTION)
  ========================================================= */
  static applyGST(
    item: CartWithDiscount,
    gstMode: "CGST_SGST" | "IGST"
  ): CartWithGST {
    const taxableValue = money(item.taxableValue || 0);

    const gstRate = Number(item.gstRate || 0);

    const gstAmount = money(
      taxableValue * (gstRate / 100)
    );

    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    if (gstMode === "CGST_SGST") {
      cgst = money(gstAmount / 2);
      sgst = money(gstAmount / 2);

      // FIX rounding drift
      const diff = money(gstAmount - (cgst + sgst));
      sgst = money(sgst + diff);
    }

    if (gstMode === "IGST") {
      igst = gstAmount;
    }

    const lineTotal = money(
      taxableValue + gstAmount
    );

    return {
      ...item,

      taxableValue,

      gstAmount,

      cgst,
      sgst,
      igst,

      lineTotal,
    };
  }

  /* =========================================================
     FINAL INVOICE CALCULATION PIPELINE
  ========================================================= */
  static calculateInvoice(
    items: CartBaseItem[],
    totalDiscount: number,
    gstMode: "CGST_SGST" | "IGST"
  ): CartWithGST[] {
    const discounted = this.applyDiscount(
      items,
      totalDiscount
    );

    return discounted.map((item) =>
      this.applyGST(item, gstMode)
    );
  }
}
