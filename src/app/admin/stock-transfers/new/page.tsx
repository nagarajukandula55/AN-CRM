"use client";

export default function NewTransfer() {
  return (
    <div className="p-6">

      <h1 className="mb-6 text-2xl font-bold">
        New Stock Transfer
      </h1>

      <div className="grid gap-4">

        <input
          className="border p-3"
          placeholder="From Warehouse"
        />

        <input
          className="border p-3"
          placeholder="To Warehouse"
        />

        <textarea
          className="border p-3"
          placeholder="Remarks"
        />

        <button
          className="bg-blue-600 text-white rounded p-3"
        >
          Create Transfer
        </button>

      </div>

    </div>
  );
}
