"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewWarehouse() {
  const router = useRouter();

  const [form, setForm] =
    useState({
      warehouseCode: "",
      warehouseName: "",
      warehouseType:
        "RAW_MATERIAL",
    });

  async function save() {
    await fetch("/api/warehouses", {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify(form),
    });

    router.push(
      "/admin/warehouses"
    );
  }

  return (
    <div className="max-w-3xl p-6 text-white">
      <h1 className="mb-6 text-2xl font-bold">
        New Warehouse
      </h1>

      <div className="space-y-4">
        <input
          placeholder="Code"
          className="w-full border border-white/20 bg-black text-white p-3 rounded"
          onChange={(e) =>
            setForm({
              ...form,
              warehouseCode:
                e.target.value,
            })
          }
        />

        <input
          placeholder="Name"
          className="w-full border border-white/20 bg-black text-white p-3 rounded"
          onChange={(e) =>
            setForm({
              ...form,
              warehouseName:
                e.target.value,
            })
          }
        />

        <select
          className="w-full border border-white/20 bg-black text-white p-3 rounded"
          onChange={(e) =>
            setForm({
              ...form,
              warehouseType:
                e.target.value,
            })
          }
        >
          <option value="RAW_MATERIAL">
            Raw Material
          </option>

          <option value="PRODUCTION">
            Production
          </option>

          <option value="FINISHED_GOODS">
            Finished Goods
          </option>

          <option value="DISTRIBUTION">
            Distribution
          </option>
        </select>

        <button
          onClick={save}
          className="rounded bg-black px-6 py-3 text-white"
        >
          Save
        </button>
      </div>
    </div>
  );
}
