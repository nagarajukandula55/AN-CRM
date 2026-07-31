/**
 * The fixed set of GST rate slabs India actually uses. Every tax-rate
 * input across the app (BOM/Material Catalog, POS, Sales invoices, SC
 * workorder line items) used to be a free-text/number field, letting
 * someone type e.g. 17 or 18.5 -- not a real GST rate, and something that
 * would fail GST return filing. Per explicit direction ("don't allow
 * them to put free text ensure there must be dropdown only"), every one
 * of those inputs now uses this fixed list instead.
 */
export const GST_SLABS = [0, 0.25, 3, 5, 12, 18, 28] as const;
