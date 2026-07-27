"use client";

import { useState } from "react";
import MaterialSearchSelect from "@/components/shared/MaterialSearchSelect";

interface Props {
  items: any[];
  setItems: React.Dispatch<React.SetStateAction<any[]>>;
}

export default function PurchaseOrderItemsGrid({
  items,
  setItems,
}: Props) {
  const [selectedMaterial, setSelectedMaterial] =
    useState<any>(null);

  function addMaterial() {
    if (!selectedMaterial) return;

    const exists = items.find(
      (i) =>
        i.materialId ===
        selectedMaterial._id
    );

    if (exists) {
      alert("Material already added.");
      return;
    }

    setItems([
      ...items,
      {
        materialId: selectedMaterial._id,

        materialCode:
          selectedMaterial.materialCode,

        materialName:
          selectedMaterial.materialName,

        description:
          selectedMaterial.description || "",

        hsnCode:
          selectedMaterial.hsnCode || "",

        unit:
          selectedMaterial.unit || "",

        quantity: 1,

        rate: 0,

        discountPercent: 0,

        discountAmount: 0,

        taxPercent:
          selectedMaterial.gstRate || 0,

        taxAmount: 0,

        lineTotal: 0,
      },
    ]);

    setSelectedMaterial(null);
  }

  function updateItem(
    index: number,
    field: string,
    value: any
  ) {
    const list = [...items];

    list[index][field] = value;

    const qty =
      Number(list[index].quantity);

    const rate =
      Number(list[index].rate);

    const discountPercent =
      Number(
        list[index].discountPercent
      );

    const taxPercent =
      Number(
        list[index].taxPercent
      );

    const gross = qty * rate;

    const discount =
      (gross *
        discountPercent) /
      100;

    const taxable =
      gross - discount;

    const tax =
      (taxable * taxPercent) /
      100;

    list[index].discountAmount =
      discount;

    list[index].taxAmount =
      tax;

    list[index].lineTotal =
      taxable + tax;

    setItems(list);
  }

  function removeRow(index: number) {
    const list = [...items];

    list.splice(index, 1);

    setItems(list);
  }

  return (
    <div className="bg-white rounded-lg border shadow p-6">

      <h2 className="text-xl font-semibold mb-4">
        Purchase Order Items
      </h2>

      <div className="flex gap-3 mb-5">

        <div className="flex-1">

          <MaterialSearchSelect
            value={selectedMaterial}
            onChange={setSelectedMaterial}
          />

        </div>

        <button
          onClick={addMaterial}
          className="bg-green-600 text-white px-5 rounded"
        >
          Add Material
        </button>

      </div>

      <div className="overflow-x-auto">

        <table className="min-w-full border">

          <thead className="bg-gray-100">

            <tr>

              <th className="border p-2">
                Code
              </th>

              <th className="border p-2">
                Material
              </th>

              <th className="border p-2">
                Unit
              </th>

              <th className="border p-2">
                Qty
              </th>

              <th className="border p-2">
                Rate
              </th>

              <th className="border p-2">
                Discount %
              </th>

              <th className="border p-2">
                GST %
              </th>

              <th className="border p-2">
                Total
              </th>

              <th className="border p-2">
              </th>

            </tr>

          </thead>

          <tbody>

            {items.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="text-center p-5 text-gray-500"
                >
                  No materials added.
                </td>
              </tr>
            )}

            {items.map(
              (item, index) => (
                <tr key={index}>

                  <td className="border p-2">
                    {item.materialCode}
                  </td>

                  <td className="border p-2">
                    {item.materialName}
                  </td>

                  <td className="border p-2">
                    {item.unit}
                  </td>

                  <td className="border p-2">

                    <input
                      type="number"
                      className="border rounded w-20 p-1"
                      placeholder="Qty"
                      title="Quantity being ordered"
                      value={
                        item.quantity
                      }
                      onFocus={(e) => e.target.select()}
                      onChange={(e) =>
                        updateItem(
                          index,
                          "quantity",
                          e.target.value
                        )
                      }
                    />

                  </td>

                  <td className="border p-2">

                    <input
                      type="number"
                      className="border rounded w-24 p-1"
                      placeholder="Rate per unit"
                      title="Rate per unit, excluding tax"
                      value={item.rate}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) =>
                        updateItem(
                          index,
                          "rate",
                          e.target.value
                        )
                      }
                    />

                  </td>

                  <td className="border p-2">

                    <input
                      type="number"
                      className="border rounded w-20 p-1"
                      placeholder="Discount %"
                      title="Discount percentage on this line"
                      value={
                        item.discountPercent
                      }
                      onFocus={(e) => e.target.select()}
                      onChange={(e) =>
                        updateItem(
                          index,
                          "discountPercent",
                          e.target.value
                        )
                      }
                    />

                  </td>

                  <td className="border p-2">

                    <input
                      type="number"
                      className="border rounded w-20 p-1"
                      placeholder="Tax %"
                      title="Tax percentage applied on this line"
                      value={
                        item.taxPercent
                      }
                      onFocus={(e) => e.target.select()}
                      onChange={(e) =>
                        updateItem(
                          index,
                          "taxPercent",
                          e.target.value
                        )
                      }
                    />

                  </td>

                  <td className="border p-2 font-semibold">
                    ₹{" "}
                    {Number(
                      item.lineTotal
                    ).toFixed(2)}
                  </td>

                  <td className="border p-2">

                    <button
                      onClick={() =>
                        removeRow(index)
                      }
                      className="text-red-600"
                    >
                      Delete
                    </button>

                  </td>

                </tr>
              )
            )}

          </tbody>

        </table>

      </div>

    </div>
  );
}
