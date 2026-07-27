"use client";

import { useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";

export default function NewBOMPage() {
  const router = useRouter();

  const { data: variantsRes } = useSWR("/api/product-variants");
  const variants: any[] = variantsRes?.data || [];

  const { data: materialsRes } = useSWR("/api/materials");
  const materials: any[] = materialsRes?.data || [];

  const [form, setForm] = useState({
    productVariantId: "",
    versionNumber: 1,
    batchSize: 1,
    yieldPercent: 100,
    notes: "",
  });

  const [items, setItems] = useState<any[]>([]);

  function addRow() {
    setItems([
      ...items,
      {
        materialId: "",
        quantity: 0,
        unit: "",
        wastagePercent: 0,
        currentCost: 0,
        safeCost: 0,
        worstCaseCost: 0,
      },
    ]);
  }

  function updateRow(
    index: number,
    field: string,
    value: any
  ) {
    const updated = [...items];

    updated[index][field] =
      value;

    setItems(updated);
  }

  async function save() {
    const totalCurrentCost =
      items.reduce(
        (sum, item) =>
          sum +
          Number(
            item.currentCost || 0
          ),
        0
      );

    const totalSafeCost =
      items.reduce(
        (sum, item) =>
          sum +
          Number(
            item.safeCost || 0
          ),
        0
      );

    const totalWorstCaseCost =
      items.reduce(
        (sum, item) =>
          sum +
          Number(
            item.worstCaseCost || 0
          ),
        0
      );

    const payload = {
      ...form,
      items,
      totalCurrentCost,
      totalSafeCost,
      totalWorstCaseCost,
    };

    await fetch("/api/bom", {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body: JSON.stringify(
        payload
      ),
    });

    router.push("/admin/bom");
  }

  return (
    <div className="p-6">

      <h1 className="mb-6 text-2xl font-bold">
        Create BOM
      </h1>

      <div className="grid gap-4 md:grid-cols-2">

        <select
          className="border border-white/20 bg-black text-white p-3 rounded"
          value={
            form.productVariantId
          }
          onChange={(e) =>
            setForm({
              ...form,
              productVariantId:
                e.target.value,
            })
          }
        >
          <option value="">
            Select Variant
          </option>

          {variants.map((v) => (
            <option
              key={v._id}
              value={v._id}
            >
              {v.variantName}
            </option>
          ))}
        </select>

        <input
          type="number"
          className="border border-white/20 bg-black text-white p-3 rounded"
          placeholder="Batch Size"
          value={form.batchSize}
          onFocus={(e) => e.target.select()}
          onChange={(e) =>
            setForm({
              ...form,
              batchSize:
                Number(
                  e.target.value
                ),
            })
          }
        />

      </div>

      <div className="mt-8">

        <div className="mb-3 flex justify-between">

          <h2 className="font-semibold">
            Materials
          </h2>

          <button
            onClick={addRow}
            className="rounded bg-black px-3 py-2 text-white"
          >
            Add Material
          </button>

        </div>

        <div className="space-y-3">

          {items.map(
            (item, index) => (
              <div
                key={index}
                className="grid gap-2 md:grid-cols-7"
              >

                <select
                  className="border border-white/20 bg-black text-white p-2 rounded"
                  value={
                    item.materialId
                  }
                  onChange={(e) =>
                    updateRow(
                      index,
                      "materialId",
                      e.target.value
                    )
                  }
                >
                  <option value="">
                    Material
                  </option>

                  {materials.map(
                    (m) => (
                      <option
                        key={m._id}
                        value={m._id}
                      >
                        {
                          m.materialName
                        }
                      </option>
                    )
                  )}
                </select>

                <input
                  className="border border-white/20 bg-black text-white p-2 rounded"
                  placeholder="Qty"
                  type="number"
                  onFocus={(e) => e.target.select()}
                  onChange={(e) =>
                    updateRow(
                      index,
                      "quantity",
                      Number(
                        e.target
                          .value
                      )
                    )
                  }
                />

                <input
                  className="border border-white/20 bg-black text-white p-2 rounded"
                  placeholder="Unit"
                  onChange={(e) =>
                    updateRow(
                      index,
                      "unit",
                      e.target.value
                    )
                  }
                />

                <input
                  className="border border-white/20 bg-black text-white p-2 rounded"
                  placeholder="Wastage"
                  type="number"
                  onFocus={(e) => e.target.select()}
                  onChange={(e) =>
                    updateRow(
                      index,
                      "wastagePercent",
                      Number(
                        e.target
                          .value
                      )
                    )
                  }
                />

                <input
                  className="border border-white/20 bg-black text-white p-2 rounded"
                  placeholder="Current Cost"
                  type="number"
                  onFocus={(e) => e.target.select()}
                  onChange={(e) =>
                    updateRow(
                      index,
                      "currentCost",
                      Number(
                        e.target
                          .value
                      )
                    )
                  }
                />

                <input
                  className="border border-white/20 bg-black text-white p-2 rounded"
                  placeholder="Safe Cost"
                  type="number"
                  onFocus={(e) => e.target.select()}
                  onChange={(e) =>
                    updateRow(
                      index,
                      "safeCost",
                      Number(
                        e.target
                          .value
                      )
                    )
                  }
                />

                <input
                  className="border border-white/20 bg-black text-white p-2 rounded"
                  placeholder="Worst Cost"
                  type="number"
                  onFocus={(e) => e.target.select()}
                  onChange={(e) =>
                    updateRow(
                      index,
                      "worstCaseCost",
                      Number(
                        e.target
                          .value
                      )
                    )
                  }
                />

              </div>
            )
          )}

        </div>

      </div>

      <button
        onClick={save}
        className="mt-8 rounded bg-green-600 px-6 py-3 text-white"
      >
        Save BOM
      </button>

    </div>
  );
}
