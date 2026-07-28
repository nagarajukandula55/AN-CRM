"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function AssetsPage() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadAssets() {
    try {
      const res = await fetch("/api/assets");

      const data = await res.json();

      console.log("Assets:", data);

      setAssets(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAssets();
  }, []);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">
          Assets Library
        </h1>

        <Link href="/admin/assets/new">
          <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
            Add Asset
          </button>
        </Link>
      </div>

      {loading ? (
        <div>Loading assets...</div>
      ) : assets.length === 0 ? (
        <div className="bg-white border rounded-lg p-10 text-center">
          <p className="text-gray-500">
            No assets uploaded yet
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {assets.map((asset) => (
            <div
              key={asset._id}
              className="border rounded-lg bg-white overflow-hidden shadow-sm hover:shadow-md transition"
            >
              <div className="h-40 flex items-center justify-center bg-gray-50">
                {asset.fileUrl ? (
                  <img
                    src={asset.fileUrl}
                    alt={asset.name}
                    className="max-h-full max-w-full object-contain p-2"
                  />
                ) : (
                  <div className="text-gray-400 text-sm">
                    No Image
                  </div>
                )}
              </div>

              <div className="p-3">
                <p className="font-medium truncate">
                  {asset.name}
                </p>

                <p className="text-sm text-gray-500 capitalize">
                  {asset.category}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
