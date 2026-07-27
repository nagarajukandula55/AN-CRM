export function calculateGST(
  base: number,
  gstPercent: number,
  gstMode: "CGST_SGST" | "IGST"
) {
  const gstAmount = (base * gstPercent) / 100;

  if (gstMode === "IGST") {
    return {
      taxableValue: base,
      cgst: 0,
      sgst: 0,
      igst: gstAmount,
      total: base + gstAmount,
    };
  }

  // CGST + SGST split
  return {
    taxableValue: base,
    cgst: gstAmount / 2,
    sgst: gstAmount / 2,
    igst: 0,
    total: base + gstAmount,
  };
}
