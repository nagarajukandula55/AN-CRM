interface Props {
  sellingPrice: number;
  marginAmount: number;
  marginPercent: number;
}

export default function PricingPreview({
  sellingPrice,
  marginAmount,
  marginPercent,
}: Props) {
  return (
    <div className="border rounded p-4 bg-blue-50">

      <h3 className="font-semibold mb-3">
        Pricing Preview
      </h3>

      <div>
        Selling Price : ₹{sellingPrice}
      </div>

      <div>
        Margin : ₹{marginAmount} ({marginPercent}%)
      </div>

    </div>
  );
}
