"use client";

import { useEffect, useState } from "react";

export default function AssetLibrary({
  onSelect,
}) {
  const [assets, setAssets] = useState([]);

  useEffect(() => {
    loadAssets();
  }, []);

  async function loadAssets() {
    try {
      const res = await fetch("/api/assets");
      const data = await res.json();

      setAssets(
        Array.isArray(data) ? data : []
      );
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div>
      <h3 className="font-bold mb-3">
        Assets
      </h3>

      <div className="space-y-2">
        {assets.map((asset) => (
          <div
            key={asset._id}
            onClick={() => onSelect(asset)}
            className="border rounded p-2 cursor-pointer hover:bg-gray-100"
          >
            <img
              src={asset.fileUrl}
              alt={asset.name}
              className="h-16 w-full object-contain"
            />

            <p className="text-xs text-center mt-1">
              {asset.name}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
