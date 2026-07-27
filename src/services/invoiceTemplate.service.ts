export function buildInvoiceTemplate(order: any) {
  const isB2B = order?.gstType === "B2B" || order?.customerType === "B2B";

  /* ================= SAFE HELPERS ================= */
  const safeStr = (v: any) =>
    v === undefined || v === null ? "" : String(v);

  const safeNum = (v: any) =>
    Number.isFinite(Number(v)) ? Number(v) : 0;

  /* ================= ITEMS SOURCE (TRUTH LAYER) ================= */
  const items = Array.isArray(order?.cart)
    ? order.cart
    : Array.isArray(order?.items)
    ? order.items
    : [];

  /* ================= BUSINESS ================= */
  const businessLocation =
    order?.business?.organization?.locations?.[0];

  const businessAddress =
    typeof businessLocation === "string"
      ? businessLocation
      : businessLocation?.address || "";

  const businessState = safeStr(order?.business?.state);
  const customerState = safeStr(order?.address?.state);

  /* ================= ITEMS MAPPING (NO OVERCALCULATION) ================= */
  const mappedItems = items.map((i: any) => {
    const qty = safeNum(i?.qty ?? 1);

    const price = safeNum(
      i?.sellingPrice ??
      i?.price ??
      i?.baseTotal ??
      0
    );

    const gstPercent = safeNum(i?.gstPercent ?? i?.gstRate ?? 0);

    /* ================= STRICT SOURCE PRIORITY ================= */
    const taxableValue = safeNum(
      i?.taxableValue ??
      i?.lineTotal ??
      qty * price
    );

    const cgst = safeNum(i?.cgstAmount ?? i?.cgst ?? 0);
    const sgst = safeNum(i?.sgstAmount ?? i?.sgst ?? 0);
    const igst = safeNum(i?.igstAmount ?? i?.igst ?? 0);

    const total = safeNum(
      i?.total ??
      i?.lineTotal ??
      taxableValue + cgst + sgst + igst
    );

    return {
      name: safeStr(i?.name || i?.productName || "Item"),
      hsn: safeStr(i?.snapshot?.hsn || i?.hsn || ""),

      qty,
      price,
      gstPercent,

      taxableValue,
      cgst,
      sgst,
      igst,
      total,
    };
  });

  /* ================= TEMPLATE ================= */
  return {
    invoiceNumber:
      safeStr(order?.invoice?.invoiceNumber || order?.invoiceNumber) ||
      "N/A",

    orderId: safeStr(order?.orderId || order?._id),

    /* ================= BUSINESS ================= */
    business: {
      name: safeStr(order?.business?.name) || "AN Group",
      gst: safeStr(order?.business?.compliance?.gst?.number || ""),
      state: businessState,
      address: safeStr(businessAddress),
    },

    /* ================= CUSTOMER ================= */
    customer: {
      name: safeStr(order?.address?.name),
      phone: safeStr(order?.address?.phone),
      email: safeStr(order?.address?.email),
      gstNumber: safeStr(order?.address?.gstNumber),

      address: safeStr(
        order?.address?.address ||
        order?.address?.line1 ||
        ""
      ),

      city: safeStr(order?.address?.city),
      state: customerState,
      pincode: safeStr(order?.address?.pincode),
    },

    /* ================= ITEMS ================= */
    items: mappedItems,

    /* ================= TOTALS (SOURCE OF TRUTH = ORDER) ================= */
    totals: {
      subtotal: safeNum(order?.subtotal ?? order?.billing?.subtotal),
      cgst: safeNum(order?.cgst ?? order?.billing?.cgst),
      sgst: safeNum(order?.sgst ?? order?.billing?.sgst),
      igst: safeNum(order?.igst ?? order?.billing?.igst),
      grandTotal: safeNum(order?.amount ?? order?.billing?.grandTotal),
    },

    /* ================= META ================= */
    meta: {
      generatedAt: new Date(),
      currency: safeStr(order?.billing?.currency || "INR"),
      invoiceType: isB2B ? "B2B_TAX" : "B2C_RETAIL",
      gstMode: order?.gstMode || "CGST_SGST",
    },
  };
}
