"use client";

import Link from "next/link";
import useSWR from "swr";

export default function BOMPage() {
  const { data: bomRes, isLoading: loading } = useSWR("/api/bom");
  const data: any[] = bomRes?.data || [];

  return (
    <div className="p-6">

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          Bill Of Materials
        </h1>

        <Link
          href="/admin/bom/new"
          className="rounded bg-black px-4 py-2 text-white"
        >
          Create BOM
        </Link>
      </div>

      <div className="overflow-x-auto rounded border">
        <table className="w-full">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3 text-left">
                Variant
              </th>

              <th className="p-3 text-left">
                Version
              </th>

              <th className="p-3 text-left">
                Batch Size
              </th>

              <th className="p-3 text-left">
                Materials
              </th>

              <th className="p-3 text-left">
                Current Cost
              </th>

              <th className="p-3 text-left">
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={6}
                  className="p-4 text-center"
                >
                  Loading...
                </td>
              </tr>
            ) : (
              data.map((bom) => (
                <tr
                  key={bom._id}
                  className="border-t"
                >
                  <td className="p-3">
                    {bom?.productVariantId
                      ?.variantName ||
                      "-"}
                  </td>

                  <td className="p-3">
                    V{bom.versionNumber}
                  </td>

                  <td className="p-3">
                    {bom.batchSize}
                  </td>

                  <td className="p-3">
                    {bom.items?.length || 0}
                  </td>

                  <td className="p-3">
                    ₹
                    {(
                      bom.totalCurrentCost || 0
                    ).toFixed(2)}
                  </td>

                  <td className="p-3">
                    <Link
                      href={`/admin/bom/${bom._id}`}
                      className="text-blue-600"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
