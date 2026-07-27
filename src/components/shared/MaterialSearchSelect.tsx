"use client";

import { useEffect, useRef, useState } from "react";

interface Material {
  _id: string;
  materialName: string;
  materialCode: string;
  unit: string;
  currentPrice?: number;
  materialType?: string;
}

interface MaterialSearchSelectProps {
  value?: Material | null;
  onChange?: (material: Material | null) => void;
  onSelect?: (material: Material) => void;
  /** Shows a "+ Add new material" quick-create form (POSTs to
   * /api/vendor/materials) — only meaningful for a vendor caller (e.g. the
   * product wizard's BOM step). Left off by default so other callers of
   * this shared component (e.g. the internal Purchase Order screen, where
   * the user already has full Materials CRUD access elsewhere) don't
   * unexpectedly get a vendor-scoped creation path. */
  allowVendorCreate?: boolean;
}

export default function MaterialSearchSelect({
  value,
  onChange,
  onSelect,
  allowVendorCreate = false,
}: MaterialSearchSelectProps) {
  const [query, setQuery] = useState(
    value?.materialName || ""
  );

  const [items, setItems] = useState<Material[]>([]);
  const [open, setOpen] = useState(false);
  const [searched, setSearched] = useState(false);

  const [creating, setCreating] = useState(false);
  const [newUnit, setNewUnit] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Only reopens the dropdown for input the user actually typed -- BOMRow
  // (and other callers) pass a brand-new `value` object literal on every
  // parent re-render even when the underlying selection hasn't changed, so
  // syncing `query` off `value` by reference re-ran the search effect below
  // on every unrelated re-render (e.g. right after saving a row), which set
  // open=true again and popped the dropdown back open with no user action.
  // Keyed on the primitive fields, and userTyped stays false for this kind
  // of sync, so a saved/settled row never reopens on its own.
  const userTyped = useRef(false);

  useEffect(() => {
    userTyped.current = false;
    setQuery(value?.materialName || "");
  }, [value?._id, value?.materialName]);

  useEffect(() => {
    if (!query.trim()) {
      setItems([]);
      setOpen(false);
      setSearched(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/materials/search?q=${encodeURIComponent(query)}`
        );

        const data = await res.json();

        if (data.success) {
          setItems(data.data);
          setSearched(true);
          if (userTyped.current) setOpen(true);
        }
      } catch (err) {
        console.error(err);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const selectMaterial = (material: Material) => {
    userTyped.current = false;
    setQuery(material.materialName);
    setOpen(false);
    setCreating(false);

    onSelect?.(material);
    onChange?.(material);
  };

  async function handleCreate() {
    if (!query.trim() || !newUnit.trim()) {
      setCreateError("Enter both a name and a unit");
      return;
    }
    setSaving(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/vendor/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materialName: query.trim(), unit: newUnit.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to create material");
      }
      selectMaterial(data.data);
      setNewUnit("");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create material");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative w-full">
      <input
        className="border p-2 rounded w-full"
        placeholder="Search material..."
        value={query}
        onChange={(e) => {
          userTyped.current = true;
          setQuery(e.target.value);
          setOpen(true);
          setCreating(false);
        }}
      />

      {open && items.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-auto rounded border bg-white shadow-lg z-50">
          {items.map((m) => (
            <div
              key={m._id}
              className="cursor-pointer p-2 hover:bg-gray-100"
              onClick={() => selectMaterial(m)}
            >
              <div className="font-medium">
                {m.materialName}
              </div>

              <div className="text-xs text-gray-500">
                {m.materialCode} | {m.unit}{m.currentPrice ? ` | ₹${m.currentPrice}/${m.unit}` : ""}
              </div>
            </div>
          ))}

          {allowVendorCreate && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="w-full text-left p-2 text-sm text-blue-600 hover:bg-blue-50 border-t"
            >
              + Add &quot;{query}&quot; as a new material
            </button>
          )}
        </div>
      )}

      {/* Was silently rendering nothing on zero results -- a vendor typing a
          real material name with no matches saw no feedback at all, looking
          exactly like the search was broken rather than "no data exists
          yet." Now offers to create it inline (vendor callers only) instead
          of forcing them to wait on a Super Admin. */}
      {open && searched && items.length === 0 && !creating && (
        <div className="absolute left-0 right-0 mt-1 rounded border bg-white shadow-lg z-50 p-3 space-y-2">
          <p className="text-sm text-gray-500">No materials found for &quot;{query}&quot;</p>
          {allowVendorCreate ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="w-full rounded bg-blue-600 px-3 py-1.5 text-sm text-white"
            >
              + Add &quot;{query}&quot; as a new material
            </button>
          ) : (
            <p className="text-xs text-amber-600">
              Materials are added by your Super Admin (Admin &gt; Materials)
              — ask them to add it, then search again.
            </p>
          )}
        </div>
      )}

      {open && creating && (
        <div className="absolute left-0 right-0 mt-1 rounded border bg-white shadow-lg z-50 p-3 space-y-2">
          <p className="text-xs text-gray-500">
            Creating a new material named <span className="font-medium text-gray-800">&quot;{query}&quot;</span>.
            Its material code will be generated automatically
            (e.g. <span className="font-mono">YOUR-VENDOR-CODE-MAT-00001</span>).
          </p>
          {createError && <p className="text-xs text-red-600">{createError}</p>}
          <input
            className="border p-2 rounded w-full text-sm"
            placeholder="Unit (e.g. kg, pcs, ml)"
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving}
              className="flex-1 rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {saving ? "Creating…" : "Create & Select"}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded border px-3 py-1.5 text-sm text-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
