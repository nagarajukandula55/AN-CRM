"use client";

import { useState } from "react";
import DesignerCanvas from "@/components/designer/DesignerCanvas";

export default function NewDesign() {
  const [name, setName] = useState("");
  const [width, setWidth] = useState(100);
  const [height, setHeight] = useState(50);
  const [showCanvas, setShowCanvas] = useState(false);

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-2xl font-bold mb-6">
        Create New Design
      </h1>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block mb-2 font-medium">
              Design Name
            </label>

            <input
              type="text"
              placeholder="e.g. Shampoo Front Label"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block mb-2 font-medium">
              Width (mm)
            </label>

            <input
              type="number"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block mb-2 font-medium">
              Height (mm)
            </label>

            <input
              type="number"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>
        </div>

        <button
          onClick={() => {
            setShowCanvas(false);
          
            setTimeout(() => {
              setShowCanvas(true);
            }, 50);
          }}
          className="mt-6 bg-blue-600 text-white px-5 py-2 rounded hover:bg-blue-700"
        >
          Create Canvas
        </button>
      </div>

      {showCanvas && (
        <div className="bg-white border rounded-lg p-4">
          <h2 className="font-semibold mb-4">
            Canvas Preview ({width}mm × {height}mm)
          </h2>

          <DesignerCanvas
            labelWidth={Number(width)}
            labelHeight={Number(height)}
          />
        </div>
      )}
    </div>
  );
}
