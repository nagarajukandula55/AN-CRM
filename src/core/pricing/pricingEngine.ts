/**
 * Shared channel-pricing engine. One margin-over-cost formula, applied to
 * however many sales channels a vendor sells through, each with its own
 * editable margin% and its own view of "cost" — an offline/walk-in sale
 * never incurs the online shipping/logistics line, so its base cost is
 * smaller than the online channel's.
 *
 * To add a channel later (e.g. "Export"), add one entry to PRICING_TIERS —
 * every route/UI that iterates it picks the new tier up automatically.
 *
 * MOQ slabs: each tier can optionally define quantity break points (e.g.
 * "100+ units -> 15% margin instead of 12%") instead of one flat margin —
 * see resolveMarginPercent/computeAllTiers's qty parameter. A tier with no
 * slabs behaves exactly like a flat margin (the base case).
 */

export interface CostBreakdown {
  materialCost: number;
  wastageCost: number;
  vendorCost: number;
  shippingCost: number;
  manufacturingCost: number;
  packingCost: number;
  logisticsOverhead: number;
  /** Provision for post-sale returns/damage — see VendorProduct.returnsProvisionPercent.
   * Always included in every tier's cost (unlike shipping/logistics), since a
   * written-off unit loses its full landed cost regardless of channel. */
  returnsProvisionCost: number;
}

export type PricingTierKey = "distributor" | "retailer" | "offline" | "marketplace";

export interface PricingTierDef {
  key: PricingTierKey;
  label: string;
  description: string;
  defaultMarginPercent: number;
  /** Offline/local sales don't incur online shipping or per-order logistics
   * overhead, so those two cost lines are excluded from its base cost. */
  excludeLogistics: boolean;
}

export const PRICING_TIERS: PricingTierDef[] = [
  {
    key: "distributor",
    label: "Distributor",
    description: "Bulk price to a distributor, who resells to retailers — lowest margin since they add their own on top.",
    defaultMarginPercent: 12,
    excludeLogistics: false,
  },
  {
    key: "retailer",
    label: "Retailer",
    description: "Price to a shop/retailer selling directly to the end consumer.",
    defaultMarginPercent: 20,
    excludeLogistics: false,
  },
  {
    key: "offline",
    label: "Offline / Walk-in",
    description: "Local/offline sale with no shipping or per-order logistics cost — e.g. a customer collecting in person.",
    defaultMarginPercent: 30,
    excludeLogistics: true,
  },
  {
    key: "marketplace",
    label: "Marketplace",
    description: "Listing on a third-party marketplace (Amazon/Blinkit/etc.) that takes its own commission — typically 5-25%, set per vendor below.",
    defaultMarginPercent: 20,
    excludeLogistics: false,
  },
];

export interface MarginSlab {
  minQty: number;
  marginPercent: number;
}

export interface PricingTierSetting {
  marginPercent?: number | null;
  /** Optional MOQ slabs, sorted or not — resolveMarginPercent sorts them.
   * The slab with the highest minQty that's <= the order quantity wins. */
  slabs?: MarginSlab[];
}

export type PricingTierMargins = Partial<Record<PricingTierKey, PricingTierSetting>>;

/** The base cost a given tier's margin is calculated over — excludes
 * shipping/logistics for a tier marked excludeLogistics. Returns provision
 * is always included regardless of channel. */
export function tierBaseCost(cost: CostBreakdown, excludeLogistics: boolean): number {
  const core =
    Number(cost.materialCost || 0) +
    Number(cost.wastageCost || 0) +
    Number(cost.vendorCost || 0) +
    Number(cost.manufacturingCost || 0) +
    Number(cost.packingCost || 0) +
    Number(cost.returnsProvisionCost || 0);
  if (excludeLogistics) return core;
  return core + Number(cost.shippingCost || 0) + Number(cost.logisticsOverhead || 0);
}

/** Standard margin-over-selling-price formula: price such that
 * (price - cost) / price === marginPercent. */
export function priceFromMargin(baseCost: number, marginPercent: number): number {
  if (!baseCost || marginPercent === undefined || marginPercent === null || marginPercent >= 100) return 0;
  return baseCost / (1 - marginPercent / 100);
}

/** Resolves which margin% applies for a given order quantity: the slab with
 * the highest minQty <= qty, else the tier's flat marginPercent, else its
 * built-in default. */
export function resolveMarginPercent(setting: PricingTierSetting | undefined, defaultMarginPercent: number, qty = 1): number {
  const slabs = setting?.slabs;
  if (slabs && slabs.length) {
    const applicable = [...slabs].sort((a, b) => a.minQty - b.minQty).filter((s) => qty >= s.minQty);
    if (applicable.length) return applicable[applicable.length - 1].marginPercent;
  }
  return setting?.marginPercent ?? defaultMarginPercent;
}

export interface ComputedTier extends PricingTierDef {
  marginPercent: number;
  baseCost: number;
  price: number;
  slabs: MarginSlab[];
}

/** Computes every tier's price from a product's cost breakdown + whatever
 * margins/slabs it has saved (falling back to each tier's default, or a
 * per-vendor override for tiers like "marketplace" whose default commission
 * varies by vendor rather than being a platform-wide constant). */
export function computeAllTiers(
  cost: CostBreakdown,
  savedMargins: PricingTierMargins | undefined | null,
  opts: { qty?: number; tierDefaultOverrides?: Partial<Record<PricingTierKey, number>> } = {}
): ComputedTier[] {
  const qty = opts.qty ?? 1;
  return PRICING_TIERS.map((tier) => {
    const setting = savedMargins?.[tier.key];
    const defaultMarginPercent = opts.tierDefaultOverrides?.[tier.key] ?? tier.defaultMarginPercent;
    const marginPercent = resolveMarginPercent(setting, defaultMarginPercent, qty);
    const baseCost = tierBaseCost(cost, tier.excludeLogistics);
    return {
      ...tier,
      marginPercent,
      baseCost,
      price: Math.round(priceFromMargin(baseCost, marginPercent)),
      slabs: setting?.slabs || [],
    };
  });
}
