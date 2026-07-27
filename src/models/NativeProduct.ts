/**
 * NativeProduct — canonical model for this platform's OWN products, stored
 * on the DEFAULT mongoose connection.
 *
 * IMPORTANT — there are THREE separate "native product" things in this
 * codebase, previously conflated in this file's own top comment (which
 * incorrectly claimed "no files currently import this model" and treated
 * `Native Product.ts` as a dead duplicate to delete). Corrected after
 * investigation:
 *
 * 1. THIS file (`models/NativeProduct.ts`) — the canonical model on the
 *    DEFAULT connection. Now used by BOTH `api/product-categories/route.ts`
 *    (an aggregate product-count query — its only caller before this fix)
 *    AND `api/products/route.ts` (see #3 below — merged into this file).
 * 2. `models/Native Product.ts` (space in the filename) — genuinely
 *    DIFFERENT and NOT a duplicate: it exports `getProductModel(conn)`,
 *    used by `services/product.service.ts` and `api/orders/create/route.ts`
 *    against a SEPARATE MongoDB connection (`lib/native-mongodb.ts`'s
 *    `connectNativeDB()` — a second, distinct database, likely the
 *    original ecommerce store's legacy DB). This is a real, intentional,
 *    still-live separate system — left completely untouched.
 * 3. `api/products/route.ts` used to declare its OWN THIRD inline schema,
 *    registered under the exact same Mongoose model name `"NativeProduct"`
 *    as THIS file but on the DEFAULT connection — a real collision (same
 *    "whichever loads first silently wins" bug class already fixed for
 *    SalesInvoice.ts). That route's extra SEO fields (metaTitle,
 *    metaDescription, keywords, slug) and `isDeleted` flag were NOT on
 *    this file before — merged in additively below, and that route now
 *    imports this file instead of declaring its own copy.
 */

import mongoose, { Schema, Model, Document } from "mongoose";

export interface INativeProduct extends Document {
  name: string;
  sku?: string;
  description?: string;
  category?: string;
  businessId?: mongoose.Types.ObjectId;
  vendorId?: mongoose.Types.ObjectId;
  unit?: string;
  // Per-unit weight in kg — used to detect bulk/wholesale orders (see
  // Order.isBulkOrder): a BUSINESS-account order qualifies once
  // sum(qty * weightKg) across its cart reaches 10kg.
  weightKg?: number;
  basePrice?: number;
  taxRate?: number; // GST %
  hsn?: string; // HSN code for GST compliance
  images?: string[];
  isActive: boolean;
  isDeleted?: boolean;
  stock?: number;
  reorderLevel?: number;
  // ── SEO fields (merged in from api/products/route.ts's inline schema —
  // see this file's top comment) ──────────────────────────────────────
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string[];
  slug?: string;
  mrp?: number;
  // Groups this product with its sibling pack-sizes/variants on the
  // storefront PDP (see api/storefront/products/[slug]/route.ts's variants
  // lookup) -- shared by every VendorProduct approved under the same
  // vendor + product name (see approve route). Null/absent means this
  // product has no variant siblings.
  variantGroupKey?: string;
  variantValue?: number;
  variantUnit?: string;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const NativeProductSchema = new Schema<INativeProduct>(
  {
    name: { type: String, required: true },
    sku: { type: String },
    description: { type: String },
    category: { type: String },
    // Made required: a live-data audit (July 2026) found the products
    // collection currently empty, so there's nothing to migrate, but an
    // optional businessId here would let a product silently fall through
    // every business-scoped admin query (see the same real bug found and
    // fixed on Order.businessId in services/order.service.ts).
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    // Which vendor's approved submission this product came from -- was
    // never stamped anywhere, so vendor payout settlement
    // (core/payouts/vendorSettlement.service.ts) could never find a vendor
    // to pay: it groups Order.cart items by item.vendorId, but nothing in
    // the whole approve -> resolve -> buildCart chain ever set it. Optional
    // since a super-admin-created product (not via the vendor wizard) has
    // no vendor to attribute.
    vendorId: { type: Schema.Types.ObjectId, ref: "VendorProfile", index: true },
    unit: { type: String, default: "pcs" },
    weightKg: { type: Number, default: 0 },
    basePrice: { type: Number, default: 0 },
    taxRate: { type: Number, default: 18 }, // default GST 18%
    hsn: { type: String },
    images: [{ type: String }],
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    stock: { type: Number, default: 0 },
    reorderLevel: { type: Number, default: 0 },
    // SEO fields — merged in, see this file's top comment
    metaTitle: { type: String },
    metaDescription: { type: String },
    keywords: { type: [String], default: [] },
    slug: { type: String, unique: true, sparse: true },
    mrp: { type: Number, default: 0 },
    variantGroupKey: { type: String },
    variantValue: { type: Number },
    variantUnit: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// Indexes for common queries
NativeProductSchema.index({ businessId: 1, isActive: 1 });
NativeProductSchema.index({ sku: 1 }, { sparse: true });
NativeProductSchema.index({ variantGroupKey: 1 });

const NativeProduct: Model<INativeProduct> =
  (mongoose.models.NativeProduct as Model<INativeProduct>) ||
  mongoose.model<INativeProduct>("NativeProduct", NativeProductSchema);

export default NativeProduct;
