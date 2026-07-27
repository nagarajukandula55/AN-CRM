"use client";

import { useEffect, useState } from "react";
import { PRICING_TIERS, type PricingTierKey, type ComputedTier, type PricingTierMargins, type MarginSlab } from "@/core/pricing/pricingEngine";

interface StepCommercialProps {
  draftId: string;
  next: () => void;
  back: () => void;
}

interface ManufacturingCost {
  cleaning: number;
  grinding: number;
  mixing: number;
  labour: number;
}

interface PackingCost {
  pouchOrContainer: number;
  labelAndBatchSticker: number;
  outerCartonAndConsumable: number;
  packingLabour: number;
}

interface CommercialForm {
  vendorSku: string;
  vendorCost: number;
  vendorShippingCost: number;
  shippingCostType: "SEPARATE" | "INCLUDED";
  minimumOrderQty: number;
  leadTimeDays: number;
  availableStock: number;
  mrp: number;
  suggestedSellingPrice: number;
  manufacturingCost: ManufacturingCost;
  packingCost: PackingCost;
  logisticsOverhead: number;
  returnsProvisionPercent: number;
  pricingTiers: PricingTierMargins;
}

interface PricingData {
  materialCost: number;
  wastageCost: number;
  vendorCost: number;
  shippingCost: number;
  manufacturingCost: number;
  packingCost: number;
  logisticsOverhead: number;
  returnsProvisionCost: number;
  totalBaseCost: number;
  marginPercent: number;
  marginAmount: number;
  sellingPrice: number;
  channelTiers: ComputedTier[];
}

const EMPTY_MFG: ManufacturingCost = { cleaning: 0, grinding: 0, mixing: 0, labour: 0 };
const EMPTY_PACKING: PackingCost = {
  pouchOrContainer: 0,
  labelAndBatchSticker: 0,
  outerCartonAndConsumable: 0,
  packingLabour: 0,
};

const MARGIN_PRESETS = [20, 30, 40];

export default function StepCommercial({
  draftId,
  next,
  back,
}: StepCommercialProps) {
  const [form, setForm] = useState<CommercialForm>({
    vendorSku: "",
    vendorCost: 0,
    vendorShippingCost: 0,
    shippingCostType: "SEPARATE",
    minimumOrderQty: 1,
    leadTimeDays: 0,
    availableStock: 0,
    mrp: 0,
    suggestedSellingPrice: 0,
    manufacturingCost: EMPTY_MFG,
    packingCost: EMPTY_PACKING,
    logisticsOverhead: 0,
    returnsProvisionPercent: 0,
    pricingTiers: {},
  });

  const [skuTouched, setSkuTouched] = useState(false);
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [pricingLoading, setPricingLoading] = useState(true);
  const [priceTouched, setPriceTouched] = useState(false);
  const [mrpTouched, setMrpTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vendorCode, setVendorCode] = useState<string>("");
  const [productLabel, setProductLabel] = useState<string>("");

  // Pull the BOM-derived cost + a default margin-based suggestion from the
  // same cost/pricing engine StepBOM already established, instead of the
  // old disconnected manual "Vendor Cost" input with no link to actual
  // material cost.
  useEffect(() => {
    fetch(`/api/vendor-products/${draftId}/pricing`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setPricing(d.data);
          if (!priceTouched && d.data?.sellingPrice) {
            setForm((prev) => ({
              ...prev,
              suggestedSellingPrice: Math.round(d.data.sellingPrice),
            }));
          }
          // MRP had no suggestion at all before -- default it a bit above
          // the selling price (10%, rounded up to the nearest ₹10) so
          // there's headroom to run a discount down to the actual selling
          // price, the usual MRP-vs-selling-price relationship. Still just
          // a starting point -- edit freely.
          if (!mrpTouched && d.data?.sellingPrice) {
            setForm((prev) => ({
              ...prev,
              mrp: Math.ceil((d.data.sellingPrice * 1.1) / 10) * 10,
            }));
          }
        }
      })
      .catch(() => {})
      .finally(() => setPricingLoading(false));
    // Only re-fetch when the draft changes — the vendor's own manual
    // overrides below shouldn't be clobbered by re-fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  // Fetch the vendor's own code and the product/variant name already
  // entered in Basic Info, so the SKU actually means something instead of
  // an arbitrary fragment of the draft's internal Mongo id.
  useEffect(() => {
    fetch("/api/vendor/profile")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data?.vendorId) setVendorCode(d.data.vendorId);
      })
      .catch(() => {});
    // Also prefill the actual commercial fields if this draft already has
    // them saved -- was never fetched at all, so resuming an existing
    // draft (via the "Edit" link on /vendor/products, which previously
    // 404'd outright) reset every commercial field back to its default.
    fetch(`/api/vendor-products/${draftId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data) {
          setProductLabel(
            [d.data.productName, d.data.variantName].filter(Boolean).join(" ")
          );
          const p = d.data;
          if (p.vendorSku) setSkuTouched(true);
          if (p.suggestedSellingPrice) setPriceTouched(true);
          if (p.mrp) setMrpTouched(true);
          setForm((prev) => ({
            ...prev,
            vendorSku: p.vendorSku || prev.vendorSku,
            vendorCost: p.vendorCost ?? prev.vendorCost,
            vendorShippingCost: p.vendorShippingCost ?? prev.vendorShippingCost,
            shippingCostType: p.shippingCostType || prev.shippingCostType,
            minimumOrderQty: p.minimumOrderQty ?? prev.minimumOrderQty,
            leadTimeDays: p.leadTimeDays ?? prev.leadTimeDays,
            availableStock: p.availableStock ?? prev.availableStock,
            mrp: p.mrp ?? prev.mrp,
            suggestedSellingPrice: p.suggestedSellingPrice || prev.suggestedSellingPrice,
            manufacturingCost: p.manufacturingCost || prev.manufacturingCost,
            packingCost: p.packingCost || prev.packingCost,
            logisticsOverhead: p.logisticsOverhead ?? prev.logisticsOverhead,
            returnsProvisionPercent: p.returnsProvisionPercent ?? prev.returnsProvisionPercent,
            pricingTiers: p.pricingTiers || prev.pricingTiers,
          }));
        }
      })
      .catch(() => {});
  }, [draftId]);

  // Auto-suggest "<VENDOR CODE>-<PRODUCT VARIANT NAME>" once both pieces
  // are known, until the vendor edits it themselves. Was
  // `VP-${draftId.slice(-6)}` -- a meaningless fragment of the internal
  // Mongo id with no link to the actual vendor or product, so every SKU
  // looked like noise (e.g. "VP-A1B2C3") instead of something a vendor
  // could recognize in their own catalog.
  useEffect(() => {
    if (skuTouched || form.vendorSku || !vendorCode || !productLabel) return;
    const slug = productLabel
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    setForm((prev) => ({
      ...prev,
      vendorSku: `${vendorCode}-${slug}`,
    }));
  }, [vendorCode, productLabel, skuTouched, form.vendorSku]);

  const baseCost = pricing?.totalBaseCost ?? 0;

  const marginForPrice = (price: number) => {
    if (!baseCost || !price) return 0;
    return ((price - baseCost) / price) * 100;
  };

  const applyPreset = (marginPercent: number) => {
    const price = baseCost > 0 ? baseCost / (1 - marginPercent / 100) : 0;
    setPriceTouched(true);
    setForm((prev) => ({
      ...prev,
      suggestedSellingPrice: Math.round(price),
    }));
  };

  const handleSave = async () => {
    setError(null);
    try {
      setLoading(true);

      const res = await fetch(`/api/vendor-products/${draftId}/commercial`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.success === false) {
        setError(data.message || "Failed to save — please try again");
        return;
      }

      next();
    } catch {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full border rounded p-2";
  const labelClass = "text-xs font-medium text-gray-500";

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">
        Commercial Details
      </h2>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── BOM-derived cost, read-only ────────────────────────────── */}
      <div className="rounded border bg-gray-50 p-3 space-y-1">
        <p className="text-xs font-semibold text-gray-600">
          Computed Cost (from BOM)
        </p>
        {pricingLoading ? (
          <p className="text-sm text-gray-400">Loading cost…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-gray-500">Material cost</span>
              <span className="text-right font-mono">
                ₹{(pricing?.materialCost ?? 0).toFixed(2)}
              </span>
              <span className="text-gray-500">Wastage</span>
              <span className="text-right font-mono">
                ₹{(pricing?.wastageCost ?? 0).toFixed(2)}
              </span>
              <span className="text-gray-500">Shipping</span>
              <span className="text-right font-mono">
                ₹{(pricing?.shippingCost ?? 0).toFixed(2)}
              </span>
              <span className="text-gray-500">Manufacturing</span>
              <span className="text-right font-mono">
                ₹{(pricing?.manufacturingCost ?? 0).toFixed(2)}
              </span>
              <span className="text-gray-500">Packing</span>
              <span className="text-right font-mono">
                ₹{(pricing?.packingCost ?? 0).toFixed(2)}
              </span>
              <span className="text-gray-500">Logistics/Overhead</span>
              <span className="text-right font-mono">
                ₹{(pricing?.logisticsOverhead ?? 0).toFixed(2)}
              </span>
              <span className="text-gray-500">Returns/Damage provision</span>
              <span className="text-right font-mono">
                ₹{(pricing?.returnsProvisionCost ?? 0).toFixed(2)}
              </span>
              <span className="font-semibold text-gray-700">
                Total base cost
              </span>
              <span className="text-right font-mono font-semibold">
                ₹{baseCost.toFixed(2)}
              </span>
            </div>
            {baseCost <= 0 && (
              <p className="text-xs text-amber-600 pt-1">
                No BOM cost found yet — complete the BOM step first for an
                accurate pricing suggestion.
              </p>
            )}
          </>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass}>
          Vendor SKU{" "}
          <span className="text-gray-400 font-normal">
            (auto-suggested — edit if needed)
          </span>
        </label>
        <input
          className={`${inputClass} font-mono text-sm`}
          value={form.vendorSku}
          onChange={(e) => {
            setSkuTouched(true);
            setForm({ ...form, vendorSku: e.target.value });
          }}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass}>
          Additional Cost{" "}
          <span className="text-gray-400 font-normal">
            (optional — anything not already covered by the BOM above, e.g. a
            packaging surcharge)
          </span>
        </label>
        <input
          type="number"
          className={inputClass}
          onFocus={(e) => e.target.select()}
          placeholder="0"
          value={form.vendorCost}
          onChange={(e) =>
            setForm({
              ...form,
              vendorCost: Number(e.target.value),
            })
          }
        />
      </div>

      <div className="rounded border p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-600">
          Manufacturing Cost <span className="text-gray-400 font-normal">(per pack of this variant — cleaning/processing labour, not the raw material itself)</span>
        </p>
        <div className="grid grid-cols-4 gap-2">
          {(["cleaning", "grinding", "mixing", "labour"] as const).map((key) => (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-[11px] text-gray-500 capitalize">{key}</label>
              <input
                type="number"
                className={inputClass}
                onFocus={(e) => e.target.select()}
                placeholder="0"
                value={form.manufacturingCost[key]}
                onChange={(e) =>
                  setForm({
                    ...form,
                    manufacturingCost: { ...form.manufacturingCost, [key]: Number(e.target.value) },
                  })
                }
              />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded border p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-600">
          Packing Cost <span className="text-gray-400 font-normal">(per pack — leave 0 for anything already priced as a material in the BOM step, e.g. a pouch or label added there)</span>
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-gray-500">Pouch / Container</label>
            <input
              type="number"
              className={inputClass}
              onFocus={(e) => e.target.select()}
              placeholder="0"
              value={form.packingCost.pouchOrContainer}
              onChange={(e) => setForm({ ...form, packingCost: { ...form.packingCost, pouchOrContainer: Number(e.target.value) } })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-gray-500">Label &amp; Batch Sticker</label>
            <input
              type="number"
              className={inputClass}
              onFocus={(e) => e.target.select()}
              placeholder="0"
              value={form.packingCost.labelAndBatchSticker}
              onChange={(e) => setForm({ ...form, packingCost: { ...form.packingCost, labelAndBatchSticker: Number(e.target.value) } })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-gray-500">Outer Carton &amp; Consumables</label>
            <input
              type="number"
              className={inputClass}
              onFocus={(e) => e.target.select()}
              placeholder="0"
              value={form.packingCost.outerCartonAndConsumable}
              onChange={(e) => setForm({ ...form, packingCost: { ...form.packingCost, outerCartonAndConsumable: Number(e.target.value) } })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-gray-500">Packing Labour</label>
            <input
              type="number"
              className={inputClass}
              onFocus={(e) => e.target.select()}
              placeholder="0"
              value={form.packingCost.packingLabour}
              onChange={(e) => setForm({ ...form, packingCost: { ...form.packingCost, packingLabour: Number(e.target.value) } })}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass}>
          Logistics / Overhead <span className="text-gray-400 font-normal">(per pack, ₹ — freight/warehousing/general overhead not already covered by Shipping Cost below)</span>
        </label>
        <input
          type="number"
          className={inputClass}
          onFocus={(e) => e.target.select()}
          placeholder="0"
          value={form.logisticsOverhead}
          onChange={(e) => setForm({ ...form, logisticsOverhead: Number(e.target.value) })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass}>
          Returns / Damage Provision % <span className="text-gray-400 font-normal">(buffer over landed cost for post-sale returns/damage — applies to every channel below)</span>
        </label>
        <input
          type="number"
          className={inputClass}
          onFocus={(e) => e.target.select()}
          placeholder="0"
          value={form.returnsProvisionPercent}
          onChange={(e) => setForm({ ...form, returnsProvisionPercent: Number(e.target.value) })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className={labelClass}>
            Shipping Cost <span className="text-gray-400 font-normal">(per unit, ₹)</span>
          </label>
          <input
            type="number"
            className={inputClass}
            onFocus={(e) => e.target.select()}
            placeholder="0"
            value={form.vendorShippingCost}
            onChange={(e) =>
              setForm({
                ...form,
                vendorShippingCost: Number(e.target.value),
              })
            }
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>
            Shipping Cost Type{" "}
            <span className="text-gray-400 font-normal">
              (charged separately at checkout, or folded into the selling price?)
            </span>
          </label>
          <select
            className={inputClass}
            value={form.shippingCostType}
            onChange={(e) =>
              setForm({
                ...form,
                shippingCostType: e.target
                  .value as CommercialForm["shippingCostType"],
              })
            }
          >
            <option value="SEPARATE">Separate — added at checkout</option>
            <option value="INCLUDED">Included — folded into selling price</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-1">
          <label className={labelClass}>
            Minimum Order Qty <span className="text-gray-400 font-normal">(units per order)</span>
          </label>
          <input
            type="number"
            className={inputClass}
            onFocus={(e) => e.target.select()}
            placeholder="1"
            value={form.minimumOrderQty}
            onChange={(e) =>
              setForm({
                ...form,
                minimumOrderQty: Number(e.target.value),
              })
            }
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>
            Lead Time <span className="text-gray-400 font-normal">(days to fulfill an order)</span>
          </label>
          <input
            type="number"
            className={inputClass}
            onFocus={(e) => e.target.select()}
            placeholder="0"
            value={form.leadTimeDays}
            onChange={(e) =>
              setForm({
                ...form,
                leadTimeDays: Number(e.target.value),
              })
            }
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>
            Available Stock <span className="text-gray-400 font-normal">(units on hand today)</span>
          </label>
          <input
            type="number"
            className={inputClass}
            onFocus={(e) => e.target.select()}
            placeholder="0"
            value={form.availableStock}
            onChange={(e) =>
              setForm({
                ...form,
                availableStock: Number(e.target.value),
              })
            }
          />
        </div>
      </div>

      {/* ── Pricing guidance ────────────────────────────────────────── */}
      <div className="rounded border p-3 space-y-3">
        <p className="text-xs font-semibold text-gray-600">
          Selling Price Guidance
        </p>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>
            MRP <span className="text-gray-400 font-normal">(suggested — edit if needed)</span>
          </label>
          <input
            type="number"
            className={inputClass}
            onFocus={(e) => e.target.select()}
            value={form.mrp}
            onChange={(e) => {
              setMrpTouched(true);
              setForm({ ...form, mrp: Number(e.target.value) });
            }}
          />
        </div>

        <div className="flex gap-2">
          {MARGIN_PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => applyPreset(m)}
              disabled={baseCost <= 0}
              className="rounded border px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-40"
            >
              {m}% margin
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>Selling Price</label>
          <input
            type="number"
            className={inputClass}
            onFocus={(e) => e.target.select()}
            value={form.suggestedSellingPrice}
            onChange={(e) => {
              setPriceTouched(true);
              setForm({
                ...form,
                suggestedSellingPrice: Number(e.target.value),
              });
            }}
          />
        </div>

        {baseCost > 0 && form.suggestedSellingPrice > 0 && (
          <p className="text-sm">
            Margin at this price:{" "}
            <span
              className={`font-semibold ${
                marginForPrice(form.suggestedSellingPrice) < 0
                  ? "text-red-600"
                  : "text-green-700"
              }`}
            >
              {marginForPrice(form.suggestedSellingPrice).toFixed(1)}%
            </span>
            {marginForPrice(form.suggestedSellingPrice) < 0 && (
              <span className="text-red-600">
                {" "}
                — selling below cost
              </span>
            )}
          </p>
        )}
      </div>

      {/* ── Channel pricing (Distributor / Retailer / Offline / Marketplace) ── */}
      <div className="rounded border p-3 space-y-4">
        <p className="text-xs font-semibold text-gray-600">
          Channel Pricing <span className="text-gray-400 font-normal">(what to charge a Distributor / Retailer / Offline / Marketplace buyer — separate from the Online selling price above)</span>
        </p>
        <p className="text-[11px] text-gray-400 -mt-3">
          Each margin% is editable — change it any time and the price recalculates. Offline excludes Shipping and
          Logistics/Overhead (a walk-in/local sale doesn't incur either). Add MOQ slabs on Distributor/Retailer to
          offer a better margin at higher order quantities — leave slabs empty to just use the flat margin.
        </p>

        {PRICING_TIERS.map((tierDef) => {
          const computed = pricing?.channelTiers?.find((t) => t.key === tierDef.key);
          const setting = form.pricingTiers[tierDef.key] || {};
          const marginValue = setting.marginPercent ?? tierDef.defaultMarginPercent;
          const slabs: MarginSlab[] = setting.slabs || [];

          const updateTier = (patch: Partial<typeof setting>) =>
            setForm({ ...form, pricingTiers: { ...form.pricingTiers, [tierDef.key]: { ...setting, ...patch } } });

          return (
            <div key={tierDef.key} className="border-t border-gray-100 pt-3 first:border-t-0 first:pt-0 space-y-2">
              <div className="grid grid-cols-3 gap-3 items-end">
                <div>
                  <p className="text-sm font-medium text-gray-800">{tierDef.label}</p>
                  <p className="text-[11px] text-gray-400">{tierDef.description}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-gray-500">
                    Base Margin % {slabs.length > 0 && <span className="text-gray-400">(qty below lowest slab)</span>}
                  </label>
                  <input
                    type="number"
                    className={inputClass}
                    onFocus={(e) => e.target.select()}
                    value={marginValue}
                    onChange={(e) => updateTier({ marginPercent: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <p className="text-[11px] text-gray-500">Price (from cost ₹{(computed?.baseCost ?? 0).toFixed(2)})</p>
                  <p className="text-lg font-semibold text-gray-900">₹{computed?.price ?? 0}</p>
                </div>
              </div>

              <div className="pl-1 space-y-1">
                {slabs.map((slab, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-400">Qty ≥</span>
                    <input
                      type="number"
                      className="w-20 border rounded p-1"
                      value={slab.minQty}
                      onChange={(e) => {
                        const next = [...slabs];
                        next[i] = { ...next[i], minQty: Number(e.target.value) };
                        updateTier({ slabs: next });
                      }}
                    />
                    <span className="text-gray-400">→ margin</span>
                    <input
                      type="number"
                      className="w-20 border rounded p-1"
                      value={slab.marginPercent}
                      onChange={(e) => {
                        const next = [...slabs];
                        next[i] = { ...next[i], marginPercent: Number(e.target.value) };
                        updateTier({ slabs: next });
                      }}
                    />
                    <span className="text-gray-400">%</span>
                    <button
                      type="button"
                      onClick={() => updateTier({ slabs: slabs.filter((_, si) => si !== i) })}
                      className="text-red-500 text-xs"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => updateTier({ slabs: [...slabs, { minQty: 10, marginPercent: marginValue }] })}
                  className="text-blue-600 text-xs"
                >
                  + Add MOQ slab
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between pt-4">
        <button
          onClick={back}
          className="rounded border px-4 py-2"
        >
          Back
        </button>

        <button
          onClick={handleSave}
          disabled={loading}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save & Continue"}
        </button>
      </div>
    </div>
  );
}
