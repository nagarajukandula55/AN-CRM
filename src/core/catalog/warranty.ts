export type CrmWarrantyStatus = "IW" | "OOW" | "90_DAYS";

export const WARRANTY_STATUSES: CrmWarrantyStatus[] = ["IW", "OOW", "90_DAYS"];

export const WARRANTY_STATUS_LABELS: Record<CrmWarrantyStatus, string> = {
  IW: "In Warranty (IW)",
  OOW: "Out of Warranty (OOW)",
  "90_DAYS": "90 Days Warranty",
};

// IW and 90_DAYS are both non-chargeable goodwill/warranty jobs -- no
// Estimate or Invoice may ever be generated for them, and the
// payable/handover amount is forced to 0. OOW is unaffected and keeps the
// existing chargeable flow exactly as before.
export function isNonChargeableWarranty(status?: string | null): boolean {
  return status === "IW" || status === "90_DAYS";
}
