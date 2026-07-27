import { classicGstLayout } from "./layouts/classicGst";
import { minimalLayout } from "./layouts/minimal";
import { modernColorblockLayout } from "./layouts/modernColorblock";
import type { InvoiceLayout } from "./types";

/**
 * The ONE place invoice layouts are registered. Add a new layout by
 * writing layouts/<name>.ts (export an InvoiceLayout) and adding it here
 * — everything else (the picker UI, the render API, InvoiceTemplate.ts's
 * layoutKey enum) reads from this map, so nothing needs updating in more
 * than 2 places to add a 4th/5th layout later.
 */
export const LAYOUTS: Record<string, InvoiceLayout> = {
  "classic-gst": classicGstLayout,
  minimal: minimalLayout,
  "modern-colorblock": modernColorblockLayout,
};

export const DEFAULT_LAYOUT_KEY = "classic-gst";

export function getLayout(key?: string): InvoiceLayout {
  return LAYOUTS[key || DEFAULT_LAYOUT_KEY] || LAYOUTS[DEFAULT_LAYOUT_KEY];
}

export function listLayouts(): InvoiceLayout[] {
  return Object.values(LAYOUTS);
}
