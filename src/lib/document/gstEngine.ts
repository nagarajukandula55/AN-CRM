export function detectGSTType(address: any) {
  if (address?.gstNumber) return "B2B";
  return "B2C";
}

export function getGSTMode(state: string, sellerState: string) {
  if (!state || !sellerState) return "UNKNOWN";

  return state === sellerState ? "CGST_SGST" : "IGST";
}
