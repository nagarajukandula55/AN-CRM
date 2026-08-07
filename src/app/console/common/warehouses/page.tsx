"use client";

import Link from "next/link";
import useSWR from "swr";

export default function WarehousesPage() {
  const { data: json } = useSWR("/api/warehouses");
  const data = json?.data || [];

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          Warehouses
        </h1>

        <Link
          href="/console/common/warehouses/new"
          className="rounded bg-black px-4 py-2 text-white"
        >
          Add Warehouse
        </Link>
      </div>

      <table className="w-full border">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Type</th>
            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          {data.map((row: any) => (
            <tr key={row._id}>
              <td>{row.warehouseCode}</td>
              <td>{row.warehouseName}</td>
              <td>{row.warehouseType}</td>
              <td>
                {row.active
                  ? "Active"
                  : "Inactive"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
