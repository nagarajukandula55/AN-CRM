/**
 * Rounds a money value to 2 decimal places -- plain floating-point
 * arithmetic on line items (qty * unitPrice * taxRate/100, summed across
 * many lines) accumulates binary-floating-point error, which without this
 * shows up as amounts like "Rs 972.0000000000001" stored straight into
 * SalesInvoice.grandTotal (confirmed live via scripts/diagnoseWorkorder
 * Invoices.ts) -- fine for arithmetic, wrong to ever display or store as a
 * currency amount. Applied at the point each amount is computed/stored,
 * not just at display time, so aggregates (SUM across invoices for a
 * report) don't inherit the same drift.
 */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
