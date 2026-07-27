import Product from "@/models/Product";

/* =========================================================
   RESERVE STOCK
========================================================= */

export async function reserveStock(
  cart: any[]
) {
  if (
    !Array.isArray(cart) ||
    cart.length === 0
  ) {
    return {
      success: false,
      message: "Cart empty",
    };
  }

  for (const item of cart) {
    const qty = Number(item.qty || 0);

    if (!item.productId || qty <= 0) {
      return {
        success: false,
        message:
          "Invalid stock item",
      };
    }

    const product =
      await Product.findById(
        item.productId
      );

    if (!product) {
      return {
        success: false,
        message:
          "Product not found",
      };
    }

    /* =========================================================
       STOCK FIELD
    ========================================================= */

    const availableStock =
      Number(
        product.stock ??
          product.quantity ??
          0
      );

    if (availableStock < qty) {
      return {
        success: false,
        message: `${product.name} out of stock`,
      };
    }

    /* =========================================================
       DEDUCT STOCK
    ========================================================= */

    product.stock =
      availableStock - qty;

    await product.save();
  }

  return {
    success: true,
  };
}

/* =========================================================
   RELEASE STOCK
========================================================= */

export async function releaseStock(
  cart: any[]
) {
  if (
    !Array.isArray(cart) ||
    cart.length === 0
  ) {
    return;
  }

  for (const item of cart) {
    const qty = Number(item.qty || 0);

    if (!item.productId || qty <= 0) {
      continue;
    }

    const product =
      await Product.findById(
        item.productId
      );

    if (!product) {
      continue;
    }

    const currentStock =
      Number(
        product.stock ??
          product.quantity ??
          0
      );

    product.stock =
      currentStock + qty;

    await product.save();
  }
}
