interface Props {
  totalMaterialCost: number;
  wastageCost: number;
  finalCost: number;
}

export default function CostSummary({
  totalMaterialCost,
  wastageCost,
  finalCost,
}: Props) {
  return (
    <div className="border rounded p-4 bg-gray-50">

      <h3 className="font-semibold mb-3">
        Cost Summary
      </h3>

      <div>Material Cost : ₹{totalMaterialCost}</div>

      <div>Wastage Cost : ₹{wastageCost}</div>

      <div className="font-bold text-green-600 mt-2">
        Final Cost : ₹{finalCost}
      </div>

    </div>
  );
}
