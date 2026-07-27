import VendorProduct from "@/models/VendorProduct";
import VendorProductBOM from "@/models/VendorProductBOM";
import VendorProfile from "@/models/VendorProfile";
import { CostBreakdown, computeAllTiers, ComputedTier } from "./pricingEngine";

/**
 * Shared cost-breakdown + channel-tier computation for a single vendor
 * product -- the one implementation both /api/vendor-products/[id]/pricing
 * (the wizard's Commercial step) and the B2B ordering portal's checkout
 * use, so a product's landed cost and channel prices are computed exactly
 * the same way regardless of caller.
 */
export async function getProductCostAndTiers(
  productId: string,
  opts: { qty?: number } = {}
): Promise<{ cost: CostBreakdown; tiers: ComputedTier[]; product: any } | null> {
  const product = await VendorProduct.findById(productId);
  if (!product) return null;

  const bomItems = await VendorProductBOM.find({ vendorProductId: productId, active: true });
  let totalMaterialCost = 0;
  let wastageCost = 0;
  for (const item of bomItems) {
    const base = Number(item.currentCost || 0);
    totalMaterialCost += base;
    wastageCost += (base * Number(item.wastagePercent || 0)) / 100;
  }

  const vendorCost = Number(product.vendorCost || 0);
  const shippingCost = Number(product.vendorShippingCost || 0);

  const mfg = product.manufacturingCost || {};
  const manufacturingCost =
    Number(mfg.cleaning || 0) + Number(mfg.grinding || 0) + Number(mfg.mixing || 0) + Number(mfg.labour || 0);

  const pkg = product.packingCost || {};
  const packingCost =
    Number(pkg.pouchOrContainer || 0) +
    Number(pkg.labelAndBatchSticker || 0) +
    Number(pkg.outerCartonAndConsumable || 0) +
    Number(pkg.packingLabour || 0);

  const logisticsOverhead = Number(product.logisticsOverhead || 0);

  const returnsProvisionPercent = Number(product.returnsProvisionPercent || 0);
  const preProvisionCost = totalMaterialCost + wastageCost + vendorCost + manufacturingCost + packingCost;
  const returnsProvisionCost = (preProvisionCost * returnsProvisionPercent) / 100;

  const cost: CostBreakdown = {
    materialCost: totalMaterialCost,
    wastageCost,
    vendorCost,
    shippingCost,
    manufacturingCost,
    packingCost,
    logisticsOverhead,
    returnsProvisionCost,
  };

  let marketplaceDefault: number | undefined;
  if (product.vendorId) {
    const vendorProfile = await VendorProfile.findById(product.vendorId).select("marketplaceCommissionPercent").lean();
    marketplaceDefault = (vendorProfile as any)?.marketplaceCommissionPercent;
  }

  const tiers = computeAllTiers(cost, product.pricingTiers, {
    qty: opts.qty ?? 1,
    tierDefaultOverrides: marketplaceDefault !== undefined ? { marketplace: marketplaceDefault } : undefined,
  });

  return { cost, tiers, product };
}
