"use client";

/**
 * "Which storefront product categories are allowed for this business" --
 * ProductCategory.isActive already existed and was fully toggleable from
 * the dedicated Admin > Product Categories page, but nothing enforced it
 * on the vendor product-creation wizard's Category dropdown (see
 * /api/product-categories's includeInactive param) and there was no quick
 * way to manage it right from the Business page itself, per explicit
 * request. Self-contained embed, same pattern as DocumentNumbersPanel --
 * own fetch, own per-row save, doesn't touch the surrounding page's big
 * form/submit flow.
 */

import { useState, useEffect, useCallback } from "react";

interface Category {
  _id: string;
  name: string;
  parentId?: { _id: string; name: string } | null;
  isActive: boolean;
}

export default function ProductCategoriesPanel({ businessId }: { businessId: string }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/product-categories?businessId=${businessId}&includeInactive=true`);
      const data = await res.json();
      if (data.success) setCategories(data.categories || []);
    } catch {
      /* keep whatever was already loaded */
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  async function toggle(cat: Category) {
    setTogglingId(cat._id);
    try {
      const res = await fetch(`/api/product-categories/${cat._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !cat.isActive }),
      });
      const data = await res.json();
      if (data.success) {
        setCategories((prev) => prev.map((c) => (c._id === cat._id ? { ...c, isActive: !cat.isActive } : c)));
      }
    } finally {
      setTogglingId(null);
    }
  }

  if (loading) return <p className="text-sm text-gray-400">Loading…</p>;
  if (categories.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        No product categories exist yet for this business — add one from Admin &gt; Masters &gt; Product Categories.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
      {categories.map((cat) => (
        <label
          key={cat._id}
          className="flex items-start gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700"
        >
          <input
            type="checkbox"
            checked={cat.isActive}
            disabled={togglingId === cat._id}
            className="mt-0.5"
            onChange={() => toggle(cat)}
          />
          <span>
            {cat.parentId && <span className="text-gray-400">↳ </span>}
            {cat.name}
          </span>
        </label>
      ))}
    </div>
  );
}
