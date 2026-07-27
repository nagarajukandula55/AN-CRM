import AccessLayout, { IAccessCategoryNode } from "@/models/AccessLayout";
import { ACCESS_HIERARCHY, ModuleEntry } from "./moduleHierarchy";
import { getOrCreateANGroupBusinessId } from "./anGroupBusiness.service";

export interface EffectiveModule extends ModuleEntry {
  parentKey: string; // the subcategory (or category, if flat) key this module currently sits under
}

export interface EffectiveSubcategory {
  key: string;
  label: string;
  order: number;
  isCustom: boolean;
  modules: EffectiveModule[];
}

export interface EffectiveCategory {
  key: string;
  label: string;
  order: number;
  isCustom: boolean;
  subcategories: EffectiveSubcategory[];
}

const UNASSIGNED_KEY = "unassigned";

// No businessId given -> resolve to AN Group's own real Business record
// (see anGroupBusiness.service.ts) rather than storing/matching against a
// null sentinel.
async function resolveBusinessId(businessId?: string | null): Promise<string> {
  return businessId && businessId.trim() ? businessId : getOrCreateANGroupBusinessId();
}

async function getOrCreateLayout(businessId?: string | null) {
  const bid = await resolveBusinessId(businessId);
  let layout = await AccessLayout.findOne({ businessId: bid });
  if (!layout) layout = await AccessLayout.create({ businessId: bid, categories: [], moduleParent: {} });
  return layout;
}

/**
 * Flattens ACCESS_HIERARCHY into {module, defaultParentKey} pairs -- the
 * built-in placement every module falls back to when no admin override
 * exists. For a category with subcategories, the default parent is the
 * subcategory's key; for a category with flat modules, it's the category's
 * own key (a synthetic "flat" subcategory with the same key/label is used
 * so the tree shape is always Category > Subcategory > Module).
 */
function defaultModulePlacements(): { module: ModuleEntry; categoryKey: string; categoryLabel: string; subKey: string; subLabel: string }[] {
  const out: { module: ModuleEntry; categoryKey: string; categoryLabel: string; subKey: string; subLabel: string }[] = [];
  for (const cat of ACCESS_HIERARCHY) {
    if (cat.modules) {
      for (const m of cat.modules) {
        out.push({ module: m, categoryKey: cat.key, categoryLabel: cat.label, subKey: cat.key, subLabel: cat.label });
      }
    }
    for (const sc of cat.subcategories ?? []) {
      for (const m of sc.modules) {
        out.push({ module: m, categoryKey: cat.key, categoryLabel: cat.label, subKey: sc.key, subLabel: sc.label });
      }
    }
  }
  return out;
}

/**
 * Builds the tree the Admin > Access UI renders: built-in categories/
 * subcategories from ACCESS_HIERARCHY, plus any admin-created custom
 * categories/subcategories (from AccessLayout.categories), with every real
 * module placed under either its built-in default parent or an admin
 * override (AccessLayout.moduleParent). A module whose override points at
 * a since-deleted custom category falls back to "Unassigned" rather than
 * disappearing.
 */
export async function getEffectiveAccessHierarchy(businessId?: string | null): Promise<EffectiveCategory[]> {
  const layout = await getOrCreateLayout(businessId);
  const customNodes: IAccessCategoryNode[] = (layout.categories || []).map((c: any) =>
    c.toObject ? c.toObject() : c
  );
  const moduleParent: Record<string, string> = layout.moduleParent
    ? Object.fromEntries(layout.moduleParent as any)
    : {};

  const categories = new Map<string, EffectiveCategory>();
  const subToCategory = new Map<string, string>(); // subcategory key -> owning category key

  // 1. Seed built-in categories/subcategories.
  ACCESS_HIERARCHY.forEach((cat, ci) => {
    categories.set(cat.key, { key: cat.key, label: cat.label, order: ci, isCustom: false, subcategories: [] });
    if (cat.modules) {
      // Flat category acts as its own single subcategory.
      subToCategory.set(cat.key, cat.key);
    }
    (cat.subcategories ?? []).forEach((sc, si) => {
      subToCategory.set(sc.key, cat.key);
      categories.get(cat.key)!.subcategories.push({ key: sc.key, label: sc.label, order: si, isCustom: false, modules: [] });
    });
    if (cat.modules) {
      categories.get(cat.key)!.subcategories.push({ key: cat.key, label: cat.label, order: -1, isCustom: false, modules: [] });
    }
  });

  // 2. Layer in admin-created custom categories/subcategories.
  const customCategories = customNodes.filter((n) => !n.parentKey);
  const customSubs = customNodes.filter((n) => !!n.parentKey);
  customCategories.forEach((c) => {
    if (!categories.has(c.key)) {
      categories.set(c.key, { key: c.key, label: c.label, order: c.order, isCustom: true, subcategories: [] });
    }
  });
  customSubs.forEach((sc) => {
    const parent = categories.get(sc.parentKey!);
    if (!parent) return; // parent category was deleted; module reassignment below falls back to Unassigned
    subToCategory.set(sc.key, sc.parentKey!);
    if (!parent.subcategories.find((s) => s.key === sc.key)) {
      parent.subcategories.push({ key: sc.key, label: sc.label, order: sc.order, isCustom: true, modules: [] });
    }
  });

  // 3. Always-available fallback bucket for orphaned modules.
  if (!categories.has(UNASSIGNED_KEY)) {
    categories.set(UNASSIGNED_KEY, {
      key: UNASSIGNED_KEY, label: "Unassigned", order: 9999, isCustom: true,
      subcategories: [{ key: UNASSIGNED_KEY, label: "Unassigned", order: 0, isCustom: true, modules: [] }],
    });
    subToCategory.set(UNASSIGNED_KEY, UNASSIGNED_KEY);
  }

  // 4. Place every real module under its resolved parent.
  const placements = defaultModulePlacements();
  const subcategoryLookup = new Map<string, EffectiveSubcategory>();
  categories.forEach((cat) => cat.subcategories.forEach((sc) => subcategoryLookup.set(sc.key, sc)));

  for (const p of placements) {
    const overrideKey = moduleParent[p.module.key];
    let targetSubKey = overrideKey && subcategoryLookup.has(overrideKey) ? overrideKey : p.subKey;
    let target = subcategoryLookup.get(targetSubKey);
    if (!target) target = subcategoryLookup.get(UNASSIGNED_KEY);
    target!.modules.push({ ...p.module, parentKey: target!.key });
  }

  return Array.from(categories.values())
    .filter((c) => c.subcategories.some((sc) => sc.modules.length > 0) || c.isCustom)
    .map((c) => ({ ...c, subcategories: c.subcategories.filter((sc) => sc.modules.length > 0 || sc.isCustom) }))
    .sort((a, b) => a.order - b.order);
}

function slugify(label: string): string {
  return "custom_" + label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || `custom_${Date.now()}`;
}

export async function createCategory(label: string, parentKey: string, businessId?: string | null): Promise<IAccessCategoryNode> {
  const layout = await getOrCreateLayout(businessId);
  const key = `${slugify(label)}_${Date.now().toString(36)}`;
  const node: IAccessCategoryNode = { key, label, parentKey, order: layout.categories.length };
  layout.categories.push(node as any);
  await layout.save();
  return node;
}

export async function renameCategory(key: string, label: string, businessId?: string | null): Promise<void> {
  const layout = await getOrCreateLayout(businessId);
  const node = layout.categories.find((c: any) => c.key === key);
  if (node) {
    node.label = label;
    await layout.save();
  }
}

export async function deleteCategory(key: string, businessId?: string | null): Promise<void> {
  const layout = await getOrCreateLayout(businessId);
  // Cascade: also drop any subcategories that belonged to this category.
  // Modules pointing at either fall back to their built-in default or
  // Unassigned automatically (see getEffectiveAccessHierarchy) since we
  // only remove the container, never touch moduleParent here.
  layout.categories = layout.categories.filter((c: any) => c.key !== key && c.parentKey !== key) as any;
  await layout.save();
}

export async function moveModule(moduleKey: string, parentKey: string, businessId?: string | null): Promise<void> {
  const layout = await getOrCreateLayout(businessId);
  layout.moduleParent.set(moduleKey, parentKey);
  await layout.save();
}
