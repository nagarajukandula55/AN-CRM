"use client";

import { useEffect, useState } from "react";

export interface ColumnConfigItem {
  key: string;
  label: string;
  visible: boolean;
  order: number;
  // Only meaningful for pageKey "sidebar-nav" -- which group/subgroup key
  // this item is reassigned to. Undefined/unused for table & card pageKeys.
  group?: string;
}

export interface ColumnConfigDefault {
  key: string;
  label: string;
  group?: string;
}

/**
 * Fetches the super-admin-saved column config for `pageKey` (see
 * src/models/PageColumnConfig.ts + /api/admin/page-column-config) and
 * merges it with the page's own `defaultColumns`. Defaults win for any
 * column key not present in the saved config, so a newly-added table
 * column always shows up even if the saved config predates it (and so the
 * page still renders sensibly before anything has ever been saved for it).
 *
 * Returns columns sorted by `order`, ready for a consuming page to
 * `.filter(c => c.visible).map(...)` when rendering `<th>`/`<td>`.
 */
export function useColumnConfig(pageKey: string, defaultColumns: ColumnConfigDefault[]): ColumnConfigItem[] {
  const [saved, setSaved] = useState<ColumnConfigItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/page-column-config/${pageKey}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        const columns = d?.config?.columns;
        if (Array.isArray(columns)) {
          setSaved(
            columns.map((c: any) => ({
              key: c.key,
              label: c.label ?? c.defaultLabel,
              visible: c.visible !== false,
              order: c.order ?? 0,
              group: c.group,
            }))
          );
        } else {
          setSaved([]);
        }
      })
      .catch(() => {
        if (!cancelled) setSaved([]);
      });
    return () => {
      cancelled = true;
    };
  }, [pageKey]);

  const savedMap = new Map((saved ?? []).map((c) => [c.key, c]));

  const merged: ColumnConfigItem[] = defaultColumns.map((def, i) => {
    const override = savedMap.get(def.key);
    return {
      key: def.key,
      label: override?.label ?? def.label,
      visible: override?.visible ?? true,
      order: override?.order ?? i,
      group: override?.group ?? def.group,
    };
  });

  return merged.sort((a, b) => a.order - b.order);
}
