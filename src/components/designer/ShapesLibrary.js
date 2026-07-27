"use client";

export default function ShapesLibrary({
  addRect,
  addCircle,
}) {
  return (
    <div className="border rounded p-3 bg-white">
      <h3 className="font-bold mb-3">
        Shapes
      </h3>

      <button
        onClick={addRect}
        className="w-full mb-2 bg-green-600 text-white py-2 rounded"
      >
        Rectangle
      </button>

      <button
        onClick={addCircle}
        className="w-full mb-2 bg-purple-600 text-white py-2 rounded"
      >
        Circle
      </button>
    </div>
  );
}
