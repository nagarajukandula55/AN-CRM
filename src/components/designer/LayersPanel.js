"use client";

export default function LayersPanel({
  objects,
  selectedId,
  onSelect,
}) {
  return (
    <div className="border rounded p-3 bg-white h-full">
      <h3 className="font-bold mb-3">
        Layers
      </h3>

      {objects.length === 0 ? (
        <p className="text-gray-500 text-sm">
          No Layers
        </p>
      ) : (
        <div className="space-y-2">
          {objects.map((obj) => (
            <div
              key={obj.id}
              onClick={() =>
                onSelect(obj.id)
              }
              className={`p-2 border rounded cursor-pointer ${
                selectedId === obj.id
                  ? "bg-blue-100 border-blue-500"
                  : ""
              }`}
            >
              {obj.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
