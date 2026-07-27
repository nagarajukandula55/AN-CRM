import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";

import VendorProduct from "@/models/VendorProduct";
import VendorProfile from "@/models/VendorProfile";
import Product from "@/models/Product";
import ProductVariant from "@/models/ProductVariant";
import NativeProduct from "@/models/NativeProduct";
import ProductCategory from "@/models/ProductCategory";
import { generateSEO } from "@/services/seo.service";
import { slugify } from "@/lib/slugify";
import { generateScopedDocumentNumber } from "@/core/numbering/numberingService";
import DocumentNumberConfig from "@/models/DocumentNumberConfig";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

export async function POST(req: Request, context: any) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    // Approval is deliberately NOT gated by the generic vendor_products:approve
    // permission -- that permission is granted broadly to vendor "full
    // access" roles (needed for other actions in the module), which meant a
    // vendor could self-approve their own product submission. Per explicit
    // direction: only AN Group's own Super Admin may approve a vendor
    // product, never the vendor/business themselves or any business-level
    // admin.
    if (!session.isSuperAdmin) {
      return NextResponse.json(
        { success: false, message: "Only an AN Group Super Admin can approve vendor products." },
        { status: 403 }
      );
    }

    await connectDB();

    const vendorProduct = await VendorProduct.findById(
      (await context.params).id
    );

    if (!vendorProduct) {
      return NextResponse.json(
        { success: false, message: "Not found" },
        { status: 404 }
      );
    }

    /* =========================================================
       🔒 VALIDATION: MUST HAVE COST + BOM
    ========================================================= */
    const cost = vendorProduct.calculatedCost;

    if (!cost || cost.finalCost <= 0) {
      return NextResponse.json(
        {
          success: false,
          message: "BOM / Cost not completed properly",
        },
        { status: 400 }
      );
    }

    // Was only checking BOM cost, never that the vendor actually set a
    // selling price -- a product with valid BOM cost but an untouched
    // Commercial step (suggestedSellingPrice still 0) sailed through
    // approval and went live on the storefront at ₹0. Confirmed live on
    // shopnative.in as several free-looking product cards.
    if (!vendorProduct.suggestedSellingPrice || vendorProduct.suggestedSellingPrice <= 0) {
      return NextResponse.json(
        {
          success: false,
          message: "No selling price set — complete the Commercial step before approving.",
        },
        { status: 400 }
      );
    }

    /* =========================================================
       🔒 PREVENT DOUBLE APPROVAL
    ========================================================= */
    if (vendorProduct.approvalStatus === "APPROVED") {
      return NextResponse.json(
        {
          success: false,
          message: "Already approved",
        },
        { status: 400 }
      );
    }

    /* =========================================================
       🧱 CREATE PRODUCT
    ========================================================= */
    // Product code is vendor-scoped: "<VendorProfile.vendorId>-PRD-XXXX"
    // (e.g. "ECOM-VND-0001-PRD-0001") so every product traces directly back
    // to which vendor introduced it, with its own per-vendor sequence
    // rather than one shared per-business counter.
    const vendorProfileDoc = vendorProduct.vendorId
      ? await VendorProfile.findById(vendorProduct.vendorId).lean()
      : null;
    const vendorCodePrefix = (vendorProfileDoc as any)?.vendorId || "VND-0000";

    // vendorId in context lets a business configure a custom template for
    // VENDOR_PRODUCT (Settings > Document Numbers) that includes
    // {vendorId} -- e.g. "{vendorId}-PRD-{seq}" -- so it's dynamically
    // this vendor's own code, not a fixed literal. No template configured
    // -> falls back to this route's original "{vendorId}-PRD-0001" shape.
    const numberConfig = await DocumentNumberConfig.findOne({
      businessId: String(vendorProduct.businessId),
      documentType: "VENDOR_PRODUCT",
    })
      .select("template")
      .lean();

    const { sequence: vendorProductSeq, value: generatedCode } = await generateScopedDocumentNumber(
      String(vendorProduct.vendorId || vendorProduct.businessId),
      "VENDOR_PRODUCT",
      String(vendorProduct.businessId),
      { vendorId: vendorCodePrefix }
    );
    const productCode = (numberConfig as any)?.template?.trim()
      ? generatedCode
      : `${vendorCodePrefix}-PRD-${String(vendorProductSeq).padStart(4, "0")}`;

    // Compute SEO (incl. slug) before creating -- Product.slug is a
    // required, unique top-level field, but this used to only be set on
    // product.seo (a nested field) after Product.create() had already run
    // without a slug, so creation always failed schema validation.
    const seo = generateSEO(vendorProduct);

    // Product.slug must be unique -- fall back to a suffixed slug on
    // collision, same pattern used below for NativeProduct.
    let productSlugCandidate = seo.slug;
    let productSlugAttempt = 0;
    while (await Product.findOne({ slug: productSlugCandidate }).lean()) {
      productSlugAttempt += 1;
      productSlugCandidate = `${seo.slug}-${productSlugAttempt}`;
    }

    const product = await Product.create({
      companyId: vendorProduct.businessId,

      productCode,
      productName: vendorProduct.productName,
      slug: productSlugCandidate,
      seo,

      categoryId: vendorProduct.categoryId,
      brandId: vendorProduct.brandId,
      vendorId: vendorProduct.vendorId || undefined,

      description: vendorProduct.description,
      images: vendorProduct.images,

      currentCost: cost.finalCost,
      safeCost: cost.baseCost,
      worstCaseCost: cost.wastageCost,

      status: "DRAFT",
      active: false,
    });

    /* =========================================================
       🧱 CREATE VARIANT
    ========================================================= */
    // Variant code inherits the product code so the two stay visibly
    // linked (e.g. "ECOM-VND-0001-PRD-0001-V1").
    const variantCode = `${productCode}-V1`;

    const variant = await ProductVariant.create({
      companyId: vendorProduct.businessId,
      productId: product._id,

      variantCode,
      variantName: vendorProduct.variantName,

      vendorSku: vendorProduct.vendorSku,

      // variantCode already IS the intended SKU shape
      // ("BIZ-0001-VND-0001-PRD-0001-V1") -- was being re-concatenated
      // with productCode again here, doubling it into
      // "...PRD-0001-BIZ-0001-VND-0001-PRD-0001-V1" and breaking every
      // downstream SKU lookup (confirmed live: checkout's
      // POST /api/orders/create 500'd with "Product not found: <that
      // doubled string>", since NativeProduct.sku never matched it).
      sku: variantCode,

      unit: vendorProduct.unit,
      packSize: vendorProduct.packSize,

      netWeight: vendorProduct.netWeight,
      grossWeight: vendorProduct.grossWeight,

      mrp: vendorProduct.mrp,
      sellingPrice: vendorProduct.suggestedSellingPrice,

      currentCost: cost.finalCost,

      status: "DRAFT",
      active: false,
    });

    /* =========================================================
       🔒 UPDATE VENDOR PRODUCT
    ========================================================= */
    vendorProduct.approvalStatus = "APPROVED";
    vendorProduct.status = "APPROVED";
    vendorProduct.productId = product._id;
    vendorProduct.variantId = variant._id;
    vendorProduct.approvedAt = new Date();

    await vendorProduct.save();

    /* =========================================================
       🧱 SYNC TO NativeProduct (what the Native storefront + the
       admin products list actually read from — see storefront
       routes api/storefront/products/route.ts and
       api/products/[slug]/route.ts). Without this, an approved
       VendorProduct only lived in Product/ProductVariant, which
       nothing on the storefront reads — the "approved" product was
       invisible to customers. This is the fix for that gap: the
       approval step is now the single moment a product becomes
       live everywhere (internal ERP catalog AND storefront).
    ========================================================= */
    let categoryName: string | undefined;
    if (vendorProduct.categoryId) {
      const category = await ProductCategory.findById(vendorProduct.categoryId).lean();
      categoryName = (category as any)?.name;
    }

    const nativeProductData = {
      name: `${vendorProduct.productName} ${vendorProduct.variantName || ""}`.trim(),
      sku: variant.sku,
      description: vendorProduct.description,
      category: categoryName,
      businessId: vendorProduct.businessId,
      vendorId: vendorProduct.vendorId || undefined,
      unit: vendorProduct.unit,
      basePrice: variant.sellingPrice || vendorProduct.suggestedSellingPrice || 0,
      mrp: vendorProduct.mrp || 0,
      taxRate: vendorProduct.gstRate || 0,
      hsn: vendorProduct.hsnCode,
      images: vendorProduct.images,
      isActive: true,
      isDeleted: false,
      stock: vendorProduct.availableStock || 0,
      // Same vendor + same product name = the same product family -- every
      // approved pack-size/variant of it shares this key so the storefront
      // PDP can offer a size selector (see storefront/products/[slug]
      // route's sibling lookup). Falls back to the slug base if productName
      // is somehow empty so approval never fails on this.
      variantGroupKey: vendorProduct.vendorId
        ? `${vendorProduct.vendorId}-${slugify(vendorProduct.productName || seo.slug || "")}`
        : undefined,
      variantValue: vendorProduct.packSize || undefined,
      variantUnit: vendorProduct.unit || undefined,
      metaTitle: seo.title,
      metaDescription: seo.description,
      keywords: seo.keywords?.filter((k: unknown) => typeof k === "string"),
      slug: seo.slug,
      createdBy: vendorProduct.createdBy,
    };

    let nativeProduct;
    if (vendorProduct.nativeProductId) {
      nativeProduct = await NativeProduct.findByIdAndUpdate(
        vendorProduct.nativeProductId,
        nativeProductData,
        { new: true, runValidators: true }
      );
    }
    if (!nativeProduct) {
      // Slug must be unique — fall back to a suffixed slug on collision
      // rather than failing the whole approval.
      let slugCandidate = nativeProductData.slug;
      let attempt = 0;
      while (await NativeProduct.findOne({ slug: slugCandidate }).lean()) {
        attempt += 1;
        slugCandidate = `${nativeProductData.slug}-${attempt}`;
      }
      nativeProduct = await NativeProduct.create({
        ...nativeProductData,
        slug: slugCandidate,
      });
      vendorProduct.nativeProductId = nativeProduct._id;
      await vendorProduct.save();
    }

    logAction({
      action: "APPROVE",
      entity: "VendorProduct",
      entityId: vendorProduct._id?.toString(),
      after: { product, variant, nativeProduct },
      req,
      actor: { businessId: vendorProduct.businessId?.toString() },
    });

    return NextResponse.json({
      success: true,
      data: { product, variant, nativeProduct },
    });

  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message },
      { status: 500 }
    );
  }
}
