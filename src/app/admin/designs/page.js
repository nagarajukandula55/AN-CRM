"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function DesignsPage() {
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadDesigns() {
    try {
      const res = await fetch("/api/designs");
      const data = await res.json();

      setDesigns(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setDesigns([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDesigns();
  }, []);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">
          Design Templates
        </h1>

        <Link
          href="/admin/designs/new"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          New Design
        </Link>
      </div>

      {loading ? (
        <div className="bg-white rounded-lg p-10">
          Loading...
        </div>
      ) : designs.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6">
          No designs found.
        </div>
      ) : (
        <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-4">
          {designs.map((design) => (
            <div
              key={design._id}
              className="bg-white rounded-lg border overflow-hidden"
            >
              <div className="h-40 bg-gray-100 flex items-center justify-center">
                {design.thumbnail ? (
                  <img
                    src={design.thumbnail}
                    alt={design.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-gray-400">
                    No Preview
                  </span>
                )}
              </div>

              <div className="p-3">
                <h3 className="font-semibold">
                  {design.name}
                </h3>

                <p className="text-sm text-gray-500">
                  {design.width}mm × {design.height}mm
                </p>

                <p className="text-xs text-gray-400 mt-1">
                  {design.status}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
