"use client";

import { useEffect, useState } from "react";
import PurchaseOrderItemsGrid from "./PurchaseOrderItemsGrid";

export default function PurchaseOrderForm() {
  const [vendors, setVendors] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);

  const [vendorId, setVendorId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");

  const [expectedDate, setExpectedDate] = useState("");
  const [remarks, setRemarks] = useState("");

  const [items, setItems] = useState<any[]>([]);

  const [saving, setSaving] = useState(false);

  // Was hardcoded to the literal strings "BUSINESS_ID"/"USER_ID" ("Replace
  // from auth later") -- meaning every PO ever created through this form
  // had garbage, non-existent ids in businessId/createdBy. Resolved from
  // the real session the same way every other admin form in this app does.
  const [userId, setUserId] = useState("");
  const [businessId, setBusinessId] = useState("");

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setUserId(d.user?.id || "");
          setBusinessId(d.user?.activeBusinessId || d.user?.defaultBusinessId || "");
        }
      })
      .catch(() => {});
  }, []);

  const subtotal = items.reduce(
    (sum, item) => sum + (item.lineTotal || 0),
    0
  );

  const discount = items.reduce(
    (sum, item) => sum + (item.discountAmount || 0),
    0
  );

  const tax = items.reduce(
    (sum, item) => sum + (item.taxAmount || 0),
    0
  );

  const grandTotal = subtotal - discount + tax;

  useEffect(() => {
    loadMasters();
  }, []);

  async function loadMasters() {
    try {
      const [vendorRes, warehouseRes] =
        await Promise.all([
          fetch("/api/vendors", { credentials: "include" }),
          fetch("/api/warehouses", { credentials: "include" }),
        ]);

      const vendorsJson = await vendorRes.json();
      const warehouseJson = await warehouseRes.json();

      if (vendorsJson.success)
        setVendors(vendorsJson.data);

      if (warehouseJson.success)
        setWarehouses(warehouseJson.data);
    } catch (err) {
      console.error(err);
    }
  }

  async function saveDraft() {
    if (!vendorId)
      return alert("Select Vendor");

    if (!warehouseId)
      return alert("Select Warehouse");

    if (!items.length)
      return alert("Add at least one material");

    if (!businessId)
      return alert("No active business selected -- select a business first.");

    setSaving(true);

    try {
      const res = await fetch(
        "/api/purchase-orders",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            vendorId,
            warehouseId,
            expectedDate,
            remarks,
            items,
            businessId,
            createdBy: userId,
          }),
        }
      );

      const json = await res.json();

      if (!json.success)
        throw new Error(json.message);

      alert("Purchase Order Created");

      window.location.href =
        "/admin/purchase-orders";
    } catch (err: any) {
      alert(err.message);
    }

    setSaving(false);
  }

  return (
    <div className="space-y-6">

      <div className="bg-white rounded-lg shadow border p-6">

        <h1 className="text-2xl font-bold">
          New Purchase Order
        </h1>

      </div>

      <div className="bg-white rounded-lg shadow border p-6">

        <div className="grid grid-cols-2 gap-4">

          <div>

            <label className="block mb-2 font-medium">
              Vendor
            </label>

            <select
              className="border rounded w-full p-2"
              value={vendorId}
              onChange={(e) =>
                setVendorId(e.target.value)
              }
            >
              <option value="">
                Select Vendor
              </option>

              {vendors.map((v: any) => (
                <option
                  key={v._id}
                  value={v._id}
                >
                  {v.vendorName}
                </option>
              ))}
            </select>

          </div>

          <div>

            <label className="block mb-2 font-medium">
              Warehouse
            </label>

            <select
              className="border rounded w-full p-2"
              value={warehouseId}
              onChange={(e) =>
                setWarehouseId(
                  e.target.value
                )
              }
            >
              <option value="">
                Select Warehouse
              </option>

              {warehouses.map((w: any) => (
                <option
                  key={w._id}
                  value={w._id}
                >
                  {w.warehouseName}
                </option>
              ))}
            </select>

          </div>

          <div>

            <label className="block mb-2 font-medium">
              Expected Date
            </label>

            <input
              type="date"
              value={expectedDate}
              onChange={(e) =>
                setExpectedDate(
                  e.target.value
                )
              }
              className="border rounded w-full p-2"
            />

          </div>

          <div>

            <label className="block mb-2 font-medium">
              Remarks
            </label>

            <input
              value={remarks}
              onChange={(e) =>
                setRemarks(
                  e.target.value
                )
              }
              className="border rounded w-full p-2"
            />

          </div>

        </div>

      </div>

      <PurchaseOrderItemsGrid
        items={items}
        setItems={setItems}
      />

      <div className="bg-white rounded-lg shadow border p-6">

        <div className="flex justify-end">

          <table className="text-sm">

            <tbody>

              <tr>

                <td className="pr-10 py-2">
                  Subtotal
                </td>

                <td>
                  ₹ {subtotal.toFixed(2)}
                </td>

              </tr>

              <tr>

                <td className="py-2">
                  Discount
                </td>

                <td>
                  ₹ {discount.toFixed(2)}
                </td>

              </tr>

              <tr>

                <td className="py-2">
                  GST
                </td>

                <td>
                  ₹ {tax.toFixed(2)}
                </td>

              </tr>

              <tr className="font-bold text-lg">

                <td className="pt-3">
                  Grand Total
                </td>

                <td>
                  ₹ {grandTotal.toFixed(2)}
                </td>

              </tr>

            </tbody>

          </table>

        </div>

      </div>

      <div className="flex justify-end gap-3">

        <button
          className="border px-5 py-2 rounded"
        >
          Cancel
        </button>

        <button
          onClick={saveDraft}
          disabled={saving}
          className="bg-blue-600 text-white px-6 py-2 rounded"
        >
          {saving
            ? "Saving..."
            : "Save Draft"}
        </button>

      </div>

    </div>
  );
}
