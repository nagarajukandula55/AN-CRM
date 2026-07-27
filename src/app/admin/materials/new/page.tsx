"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewMaterial() {
  const router = useRouter();

  const [form, setForm] =
    useState({
      materialCode: "",
      materialName: "",
      materialType:
        "RAW_MATERIAL",
      unit: "",
      gstRate: 0,
      hsnCode: "",
    });

  async function save() {
    await fetch("/api/materials", {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify(form),
    });

    router.push(
      "/admin/materials"
    );
  }

  return (
    <div className="max-w-4xl p-6">
      <h1 className="mb-6 text-2xl font-bold">
        New Material
      </h1>

      <div className="space-y-4">

        <input
          placeholder="Material Code"
          className="w-full border p-3"
          onChange={(e) =>
            setForm({
              ...form,
              materialCode:
                e.target.value,
            })
          }
        />

        <input
          placeholder="Material Name"
          className="w-full border p-3"
          onChange={(e) =>
            setForm({
              ...form,
              materialName:
                e.target.value,
            })
          }
        />

        <input
          placeholder="Unit"
          className="w-full border p-3"
          onChange={(e) =>
            setForm({
              ...form,
              unit:
                e.target.value,
            })
          }
        />

        <input
          placeholder="HSN Code"
          className="w-full border p-3"
          onChange={(e) =>
            setForm({
              ...form,
              hsnCode:
                e.target.value,
            })
          }
        />

        <input
          type="number"
          placeholder="GST %"
          className="w-full border p-3"
          onFocus={(e) => e.target.select()}
          onChange={(e) =>
            setForm({
              ...form,
              gstRate:
                Number(
                  e.target.value
                ),
            })
          }
        />

        <button
          onClick={save}
          className="rounded bg-black px-6 py-3 text-white"
        >
          Save Material
        </button>
      </div>
    </div>
  );
}
