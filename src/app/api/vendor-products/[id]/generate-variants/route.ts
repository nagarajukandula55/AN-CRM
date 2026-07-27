import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import VendorProduct from "@/models/VendorProduct";
import VendorProductBOM from "@/models/VendorProductBOM";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { generateDocumentNumber, generateScopedDocumentNumber } from "@/core/numbering/numberingService";
import { toGrams } from "@/lib/nutritionReference";
import { suggestSlug } from "@/lib/slugify";
import { getProductCostAndTiers } from "@/core/pricing/productCost";
import { recalcVendorProductCost } from "@/services/costEngine.service";

/**
 * POST /api/vendor-products/:id/generate-variants — from one fully-built
 * product, generates one or more additional pack-size variants end to end
 * (structure, scaled BOM, scaled manufacturing cost, copied packing/
 * commercial/compliance, computed MRP/selling price, submitted for
 * approval) without re-running the wizard for each one.
 *
 * body: { sizes: [{ netWeight: number, unit: string }] }
 *
 * What scales vs. what's copied as-is, per explicit direction:
 *  - Ingredient-type BOM rows: scaled by the pack-size ratio (same formula
 *    as the BOM step's own "Copy & Scale Ingredients" button).
 *  - Manufacturing cost (cleaning/grinding/mixing/labour): scaled by the
 *    same ratio -- it's genuinely proportional to how much product is
 *    being processed.
 *  - Packing cost, Packaging-type BOM rows, shipping/logistics/returns
 *    provision, pricing-tier margins, compliance/nutrition text: copied
 *    unscaled -- a different pack size needs its own pouch/label/carton
 *    (picked fresh, not auto-copied at all, same as the manual flow),
 *    and margins/percentages don't change with pack size.
 *  - Images/SEO/category/brand/description: copied as-is (same product,
 *    different size).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    try {
      requirePermission(session as any, buildPermissionCode("vendor_products", "edit"));
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const { id } = await params;
    await connectDB();

    const source = await VendorProduct.findById(id);
    if (!source) return NextResponse.json({ success: false, message: "Source product not found" }, { status: 404 });
    if (!source.netWeight || !source.unit) {
      return NextResponse.json({ success: false, message: "Source product has no pack size set yet" }, { status: 400 });
    }

    const body = await req.json();
    const sizes: { netWeight: number; unit: string }[] = Array.isArray(body.sizes) ? body.sizes : [];
    if (!sizes.length) return NextResponse.json({ success: false, message: "No sizes requested" }, { status: 400 });

    const sourceGrams = toGrams(source.netWeight, source.unit);
    const sourceBom = await VendorProductBOM.find({ vendorProductId: source._id, active: true });
    const ingredientRows = sourceBom.filter((r: any) => (r.materialType || "INGREDIENT") === "INGREDIENT");

    const created: any[] = [];
    const failed: { size: string; message: string }[] = [];

    for (const size of sizes) {
      const label = `${size.netWeight}${size.unit}`;
      try {
        const targetGrams = toGrams(size.netWeight, size.unit);
        const ratio = sourceGrams && targetGrams ? targetGrams / sourceGrams : 1;

        const grossWeight = source.grossWeight && source.netWeight ? Math.round(((source.grossWeight / source.netWeight) * size.netWeight) * 100) / 100 : size.netWeight;

        const mfg = source.manufacturingCost || {};
        const scaledManufacturingCost = {
          cleaning: Math.round((mfg.cleaning || 0) * ratio * 100) / 100,
          grinding: Math.round((mfg.grinding || 0) * ratio * 100) / 100,
          mixing: Math.round((mfg.mixing || 0) * ratio * 100) / 100,
          labour: Math.round((mfg.labour || 0) * ratio * 100) / 100,
        };

        const variant = new VendorProduct({
          productName: source.productName,
          variantName: label,
          description: source.description,
          categoryId: source.categoryId,
          brandId: source.brandId,
          images: source.images,
          seo: source.seo,
          clonedFromDraftId: source._id,

          unit: size.unit,
          packSize: 1,
          netWeight: size.netWeight,
          grossWeight,
          hsnCode: source.hsnCode,
          gstRate: source.gstRate,

          vendorShippingCost: source.vendorShippingCost,
          shippingCostType: source.shippingCostType,
          minimumOrderQty: source.minimumOrderQty,
          leadTimeDays: source.leadTimeDays,
          availableStock: 0,
          manufacturingCost: scaledManufacturingCost,
          packingCost: source.packingCost,
          logisticsOverhead: source.logisticsOverhead,
          returnsProvisionPercent: source.returnsProvisionPercent,
          pricingTiers: source.pricingTiers,

          compliance: source.compliance,
          nutrition: source.nutrition,

          status: "DRAFT",
          active: true,
          businessId: source.businessId,
          vendorId: source.vendorId,
          createdBy: session.user.id,
        });

        const slugBase = suggestSlug(source.productName, label);
        variant.slug = slugBase ? `${slugBase}-${Date.now().toString(36).slice(-4)}` : undefined;

        if (source.businessId) {
          const { sequence } = await generateScopedDocumentNumber(String(source.vendorId || source._id), "PRODUCT_VARIANT", String(source.businessId));
          variant.vendorSku = source.vendorSku ? `${source.vendorSku}-${size.netWeight}${size.unit}` : `VAR-${sequence}`;
        }

        await variant.save();

        for (const row of ingredientRows) {
          const quantity = Number(row.quantity || 0) * ratio;
          const grossCost = quantity * Number(row.currentRate || 0);
          const currentCost = grossCost + (grossCost * Number(row.wastagePercent || 0)) / 100;
          await VendorProductBOM.create({
            vendorProductId: variant._id,
            materialId: row.materialId,
            materialCode: row.materialCode,
            materialName: row.materialName,
            quantity,
            unit: row.unit,
            wastagePercent: row.wastagePercent,
            currentRate: row.currentRate,
            currentCost,
            materialType: "INGREDIENT",
            rateUnit: row.rateUnit || row.unit,
            remarks: `Auto-scaled ${Math.round(ratio * 100)}% from ${source.netWeight}${source.unit} variant`,
            businessId: source.businessId,
            createdBy: session.user.id,
          });
        }

        // The BOM rows above were created directly (VendorProductBOM.create),
        // bypassing the normal POST /bom route -- which is what actually
        // keeps VendorProduct.calculatedCost.finalCost in sync (see
        // costEngine.service.ts). /approve checks THAT field, not the BOM
        // rows directly, so skipping this left every auto-generated variant
        // stuck at finalCost=0 and rejected on approval ("BOM / Cost not
        // completed properly") even though its BOM was fully populated.
        await recalcVendorProductCost(String(variant._id));
        const recalced = await VendorProduct.findById(variant._id).select("calculatedCost");

        // Compute MRP/selling price from the now-real cost, same formula
        // the Commercial step's own auto-suggestion uses.
        const result = await getProductCostAndTiers(String(variant._id));
        if (result) {
          const c = result.cost;
          const totalBaseCost =
            c.materialCost + c.wastageCost + c.vendorCost + c.manufacturingCost + c.packingCost + c.returnsProvisionCost + c.shippingCost + c.logisticsOverhead;
          const sellingPrice = totalBaseCost * 1.25;
          variant.suggestedSellingPrice = Math.round(sellingPrice);
          variant.mrp = Math.ceil((sellingPrice * 1.1) / 10) * 10;
        }

        // Submit for approval automatically -- mirrors submit/route.ts's
        // own state transition (kept inline rather than an HTTP self-call).
        if (!variant.internalSku && variant.businessId) {
          const { value } = await generateDocumentNumber(String(variant.businessId), "PRODUCT");
          variant.internalSku = value;
        }
        variant.approvalStatus = "PENDING";
        variant.submittedAt = new Date();
        variant.priceFrozen = true;
        variant.priceSnapshot = {
          totalCost: recalced?.calculatedCost?.finalCost || 0,
          baseCost: recalced?.calculatedCost?.baseCost || 0,
          shippingCost: variant.vendorShippingCost || 0,
          wastageCost: recalced?.calculatedCost?.wastageCost || 0,
        };
        await variant.save();

        created.push({ id: variant._id, label, vendorSku: variant.vendorSku, mrp: variant.mrp, suggestedSellingPrice: variant.suggestedSellingPrice });
      } catch (err: any) {
        failed.push({ size: label, message: err.message });
      }
    }

    return NextResponse.json({ success: true, created, failed });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
