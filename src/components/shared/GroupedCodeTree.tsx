"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { CategoryTree, type TreeItem } from "@/components/shared/CategoryTree";
import { DEVICE_CATEGORIES, DEVICE_CATEGORY_LABELS, type DeviceCategory } from "@/core/catalog/deviceCategory";

const UNCATEGORIZED = "__uncategorized__";
const OTHER_COMPONENT = "__other__";

interface GroupableCode extends TreeItem {
  deviceCategory?: DeviceCategory | null;
  category?: string;
}

/**
 * Device Type > Component Category > Fault/Symptom Code tree, per explicit
 * direction ("in fault code take a component called Screen and screen
 * related everything should come into this ... add one more main branch
 * category that is Device type"). Shared by the Fault Codes and Symptom
 * Codes admin pages, which are otherwise near-identical.
 *
 * Grouping is derived purely from the `deviceCategory`/`category` fields
 * (no new document relationships needed) -- the leaf level within each
 * (deviceCategory, category) group still renders through the existing
 * `CategoryTree`, unmodified, so parentId-chained codes inside one
 * component group keep working exactly as before.
 */
export function GroupedCodeTree<T extends GroupableCode>({
  items,
  onEdit,
  onDelete,
}: {
  items: T[];
  onEdit: (item: T) => void;
  onDelete: (item: T) => void;
}) {
  const [openDeviceCats, setOpenDeviceCats] = useState<Set<string>>(new Set());
  const [openComponents, setOpenComponents] = useState<Set<string>>(new Set());

  const byDeviceCategory = new Map<string, T[]>();
  for (const item of items) {
    const key = item.deviceCategory || UNCATEGORIZED;
    if (!byDeviceCategory.has(key)) byDeviceCategory.set(key, []);
    byDeviceCategory.get(key)!.push(item);
  }

  const orderedDeviceCategoryKeys = [
    ...DEVICE_CATEGORIES.filter((c) => byDeviceCategory.has(c)),
    ...(byDeviceCategory.has(UNCATEGORIZED) ? [UNCATEGORIZED] : []),
  ];

  function toggle(set: Set<string>, setSet: (s: Set<string>) => void, key: string) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSet(next);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
      {orderedDeviceCategoryKeys.map((deviceCatKey) => {
        const deviceItems = byDeviceCategory.get(deviceCatKey)!;
        const deviceOpen = openDeviceCats.has(deviceCatKey);
        const label = deviceCatKey === UNCATEGORIZED ? "Uncategorized" : DEVICE_CATEGORY_LABELS[deviceCatKey as DeviceCategory];

        const byComponent = new Map<string, T[]>();
        for (const item of deviceItems) {
          const key = item.category?.trim() || OTHER_COMPONENT;
          if (!byComponent.has(key)) byComponent.set(key, []);
          byComponent.get(key)!.push(item);
        }
        const componentKeys = [...byComponent.keys()].sort((a, b) =>
          a === OTHER_COMPONENT ? 1 : b === OTHER_COMPONENT ? -1 : a.localeCompare(b)
        );

        return (
          <div key={deviceCatKey}>
            <button
              type="button"
              onClick={() => toggle(openDeviceCats, setOpenDeviceCats, deviceCatKey)}
              className="w-full flex items-center gap-2 py-2.5 px-4 hover:bg-gray-50 transition text-left"
            >
              {deviceOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
              <span className="text-sm font-semibold text-gray-900 flex-1">{label}</span>
              <span className="text-[11px] text-gray-400">{deviceItems.length}</span>
            </button>
            {deviceOpen &&
              componentKeys.map((componentKey) => {
                const componentItems = byComponent.get(componentKey)!;
                const componentFullKey = `${deviceCatKey}::${componentKey}`;
                const componentOpen = openComponents.has(componentFullKey);
                const componentLabel = componentKey === OTHER_COMPONENT ? "Other" : componentKey;

                return (
                  <div key={componentFullKey} className="pl-6 border-t border-gray-50">
                    <button
                      type="button"
                      onClick={() => toggle(openComponents, setOpenComponents, componentFullKey)}
                      className="w-full flex items-center gap-2 py-2 px-4 hover:bg-gray-50 transition text-left"
                    >
                      {componentOpen ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                      <span className="text-sm text-gray-700 flex-1">{componentLabel}</span>
                      <span className="text-[11px] text-gray-400">{componentItems.length}</span>
                    </button>
                    {componentOpen && (
                      <div className="pl-4 pb-1">
                        <CategoryTree items={componentItems} onEdit={onEdit} onDelete={onDelete} />
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        );
      })}
      {items.length === 0 && <p className="text-sm text-gray-400 px-4 py-6 text-center">No codes yet.</p>}
    </div>
  );
}
