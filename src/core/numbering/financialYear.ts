/**
 * THE canonical financial-year calculator, replacing 3 duplicate
 * implementations that didn't even agree on output format:
 *   - services/numbering.service.ts's private getFinancialYear() -> "2026-27"
 *   - lib/invoice/getFinancialYear.ts -> "2026-27" (same format, separate impl)
 *   - lib/accounting/getFinancialYear.ts -> "2627" (DIFFERENT format — no
 *     hyphen, both halves sliced to 2 digits)
 *
 * India's financial year runs April 1 - March 31 (matches
 * Business.compliance.filingCycle's "MONTHLY" GST convention already used
 * elsewhere in this codebase). getFinancialYear() returns the human-
 * readable "2025-26" form; getFinancialYearCode() derives the compact
 * "2526" form from it for callers that want the old lib/accounting format
 * (e.g. as a numbering segment) — one source of truth, two presentations,
 * instead of two independently-computed and driftable implementations.
 */

export function getFinancialYear(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12

  if (month >= 4) {
    return `${year}-${String(year + 1).slice(-2)}`;
  }
  return `${year - 1}-${String(year).slice(-2)}`;
}

export function getFinancialYearCode(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12

  const [startYear, endYear] = month >= 4 ? [year, year + 1] : [year - 1, year];
  return `${String(startYear).slice(-2)}${String(endYear).slice(-2)}`; // e.g. "2526"
}
