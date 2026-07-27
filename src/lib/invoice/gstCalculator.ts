export function calculateGST({
  qty,
  price,
  gstPercent,
  sameState,
}: {
  qty: number;
  price: number;
  gstPercent: number;
  sameState: boolean;
}) {
  const taxableValue = qty * price;
  const gstAmount = (taxableValue * gstPercent) / 100;

  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  if (sameState) {
    cgst = gstAmount / 2;
    sgst = gstAmount / 2;
  } else {
    igst = gstAmount;
  }

  return {
    taxableValue,
    cgst,
    sgst,
    igst,
    total: taxableValue + gstAmount,
  };
}
