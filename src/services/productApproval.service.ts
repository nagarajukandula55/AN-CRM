import Product from "@/models/Product";
import ProductVariant from "@/models/ProductVariant";
import VendorProduct from "@/models/VendorProduct";
import VendorProductBOM from "@/models/VendorProductBOM";
import VendorCatalog from "@/models/VendorCatalog";

import { calculateVendorProductCost }
  from "./vendorProductCost.service";

import { calculateProductNutrition }
  from "./nutritionCalculation.service";

/* =========================================================
HELPERS
========================================================= */

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function generateProductCode() {
  return "PRD-" + Date.now();
}

function generateVariantCode() {
  return "VAR-" + Date.now();
}

function generateSKU() {
  return "SKU-" + Date.now();
}

/* =========================================================
APPROVE PRODUCT
========================================================= */

export async function approveVendorProduct(
  vendorProductId: string,
  approvedBy: string
) {
  const vendorProduct =
    await VendorProduct.findById(
      vendorProductId
    );

  if (!vendorProduct) {
    throw new Error(
      "Vendor Product not found"
    );
  }

  const bom =
    await VendorProductBOM.find({
      vendorProductId,
      active: true,
    });

  if (!bom.length) {
    throw new Error(
      "BOM not found"
    );
  }

  /* ==========================================
     COST
  ========================================== */

  const costing =
    await calculateVendorProductCost(
      vendorProductId
    );

  /* ==========================================
     NUTRITION
  ========================================== */

  const nutritionResult =
    await calculateProductNutrition(
      vendorProductId
    );

  /* ==========================================
     PRODUCT
  ========================================== */

  let product;

  if (vendorProduct.productId) {
    product =
      await Product.findById(
        vendorProduct.productId
      );
  }

  if (!product) {
    product =
      await Product.create({
        productCode:
          generateProductCode(),

        productName:
          vendorProduct.productName,

        slug: slugify(
          vendorProduct.productName
        ),

        categoryId:
          vendorProduct.categoryId,

        brandId:
          vendorProduct.brandId,

        description:
          vendorProduct.description,

        images:
          vendorProduct.images,

        hsnCode:
          vendorProduct.hsnCode,

        gstRate:
          vendorProduct.gstRate,

        currentCost:
          costing.currentCost,

        safeCost:
          costing.safeCost,

        worstCaseCost:
          costing.worstCaseCost,

        status: "ACTIVE",

        active: true,
      });
  }

  /* ==========================================
     VARIANT
  ========================================== */

  let variant;

  if (vendorProduct.variantId) {
    variant =
      await ProductVariant.findById(
        vendorProduct.variantId
      );
  }

  if (!variant) {
    variant =
      await ProductVariant.create({
        productId:
          product._id,

        variantCode:
          generateVariantCode(),

        variantName:
          vendorProduct.variantName,

        sku:
          generateSKU(),

        slug: slugify(
          `${vendorProduct.productName}-${vendorProduct.variantName}`
        ),

        unit:
          vendorProduct.unit,

        packSize:
          vendorProduct.packSize,

        netWeight:
          vendorProduct.netWeight,

        grossWeight:
          vendorProduct.grossWeight,

        mrp:
          vendorProduct.mrp,

        sellingPrice:
          vendorProduct.suggestedSellingPrice,

        currentCost:
          costing.currentCost,

        safeCost:
          costing.safeCost,

        worstCaseCost:
          costing.worstCaseCost,

        minimumSellingPrice:
          costing.safeCost,

        images:
          vendorProduct.images,

        nutrition:
          nutritionResult.nutrition,

        status: "ACTIVE",

        active: true,
      });
  }

    const existingCatalog =
    await VendorCatalog.findOne({
      vendorId:
        vendorProduct.vendorId,
  
      productId:
        product._id,
  
      variantId:
        variant._id,
    });
  
  if (!existingCatalog) {
    await VendorCatalog.create({
      businessId:
        vendorProduct.businessId,
  
      vendorId:
        vendorProduct.vendorId,
  
      productId:
        product._id,
  
      variantId:
        variant._id,
  
      vendorProductId:
        vendorProduct._id,
  
      vendorSku:
        vendorProduct.vendorSku,
  
      vendorCost:
        vendorProduct.vendorCost,
  
      minimumOrderQty:
        vendorProduct.minimumOrderQty,
  
      leadTimeDays:
        vendorProduct.leadTimeDays,
  
      availableStock:
        vendorProduct.availableStock,
  
      preferredVendor: false,
  
      priority: 1,
    });
  }

  /* ==========================================
     LINK BACK
  ========================================== */

  await VendorProduct.findByIdAndUpdate(
    vendorProductId,
    {
      productId: product._id,

      variantId: variant._id,

      approvalStatus:
        "APPROVED",

      approvedBy,

      approvedAt:
        new Date(),
    }
  );

  return {
    success: true,
    productId: product._id,
    variantId: variant._id,
    cost: costing,
    nutrition:
      nutritionResult.nutrition,
  };
}
