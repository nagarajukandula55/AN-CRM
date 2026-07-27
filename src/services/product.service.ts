import mongoose from "mongoose";
import NativeProductModel from "@/models/NativeProduct";

// Was querying a completely separate legacy collection (models/"Native
// Product".ts, against its own MongoDB connection via connectNativeDB()) by
// a "productKey" field that model has and the real catalog doesn't. That
// legacy collection is disconnected from the entire vendor-product-wizard
// approval pipeline (api/vendor-products/[id]/approve) and the storefront
// listing route (api/storefront/products) -- both of those read/write
// models/NativeProduct.ts on the MAIN database. The practical effect: no
// vendor-approved product could ever actually be purchased, because
// checkout looked for it somewhere it was never written. Found via a live
// checkout test that 404'd immediately on a product that was visibly
// listed on the storefront. Now resolves against the same NativeProduct
// model everything else uses, matched by _id (what Native's cart actually
// sends as productKey -- see ProductsPageClient.js's
// `productKey: p.productKey || p.mongoId || p._id`) with slug as a
// fallback for any caller still using the human-readable key.
export type NativeProduct = {
  _id: any;
  productKey: string;
  name: string;
  tax?: number;
  basePrice?: number;
  weightKg?: number;
  isDeleted?: boolean;
  vendorId?: string;
};

export class ProductService {
  static async resolveProduct(
    item: any
  ): Promise<{
    product: NativeProduct;
    qty: number;
  }> {
    const qty = Number(item.qty || 1);

    if (qty <= 0) {
      throw new Error("Invalid quantity");
    }

    const productKey = item.productKey;

    if (!productKey) {
      throw new Error("Missing product key");
    }

    console.log("=================================");
    console.log("CHECKOUT PRODUCT LOOKUP");
    console.log("PRODUCT KEY:", productKey);

    const query = mongoose.Types.ObjectId.isValid(productKey)
      ? { $or: [{ _id: productKey }, { slug: productKey }] }
      : { slug: productKey };

    const raw = await NativeProductModel.findOne({
      ...query,
      isDeleted: { $ne: true },
    }).lean<any>();

    console.log("FOUND:", !!raw);

    if (!raw) {
      console.error("PRODUCT NOT FOUND:", productKey);
      throw new Error(`Product not found: ${productKey}`);
    }

    const product: NativeProduct = {
      _id: raw._id,
      productKey: String(raw._id),
      name: raw.name,
      tax: raw.taxRate,
      basePrice: raw.basePrice,
      weightKg: Number(raw.weightKg || 0),
      isDeleted: raw.isDeleted,
      vendorId: raw.vendorId ? String(raw.vendorId) : undefined,
    };

    return {
      product,
      qty,
    };
  }

  static getPrice(product: NativeProduct): number {
    const price = product.basePrice ?? 0;

    if (!price || isNaN(price)) {
      throw new Error(
        `Invalid price for product: ${product.productKey}`
      );
    }

    return Number(price);
  }
}
