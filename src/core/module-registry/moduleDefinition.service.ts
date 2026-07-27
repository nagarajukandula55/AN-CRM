import type { FlattenMaps, Types } from "mongoose";
import ModuleDefinition, { IModuleDefinition } from "./ModuleDefinition.model";
import type { FieldDefinition } from "./types";
import { syncPermissionsForModule, syncSuperAdminRole } from "@/core/access/permissionSync.service";

// .lean() returns plain objects shaped by FlattenMaps<T>, not the Document
// interface itself (Document-only members like .save()/.populate() aren't
// present, and nested Map/subdoc fields are flattened) — using IModuleDefinition
// directly as the return type here doesn't match what Mongoose actually
// returns and fails `npm run build` under strict mode. This alias names the
// real lean-query shape so callers still get real field types, just not the
// (incorrect) promise of Document methods.
export type LeanModuleDefinition = FlattenMaps<IModuleDefinition> & {
  _id: Types.ObjectId;
  __v: number;
};

export interface CreateModuleInput {
  key: string;
  label: string;
  pluralLabel: string;
  description?: string;
  icon?: string;
  route: string;
  businessId: string; // custom modules are always business-scoped; system modules are seeded separately, not via this path
  fields: FieldDefinition[];
  applicableActions?: string[];
  createdBy: string;
}

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * Create a new custom module definition for a business. This is the entry
 * point for "admin invents a new module from the UI" — the whole point of
 * Option A. Deliberately validates the key format strictly (lowercase,
 * snake_case) since this key becomes a permanent identifier used in URLs,
 * permission codes, and ModuleRecord.moduleKey — same discipline as the
 * existing Permission.code convention in the current app.
 */
export async function createModuleDefinition(
  input: CreateModuleInput
): Promise<IModuleDefinition> {
  if (!KEY_PATTERN.test(input.key)) {
    throw new Error(
      `Module key "${input.key}" is invalid — use lowercase letters, numbers, and underscores only, starting with a letter (e.g. "warranty_claim").`
    );
  }

  const fieldKeys = new Set<string>();
  for (const field of input.fields) {
    if (fieldKeys.has(field.key)) {
      throw new Error(`Duplicate field key "${field.key}" in module "${input.key}".`);
    }
    fieldKeys.add(field.key);
  }

  const existing = await ModuleDefinition.findOne({
    key: input.key,
    businessId: input.businessId,
  });
  if (existing) {
    throw new Error(`A module with key "${input.key}" already exists for this business.`);
  }

  const maxSortOrder = await ModuleDefinition.findOne({ businessId: input.businessId })
    .sort({ sortOrder: -1 })
    .select("sortOrder")
    .lean<{ sortOrder: number } | null>();

  const moduleDef = await ModuleDefinition.create({
    key: input.key,
    label: input.label,
    pluralLabel: input.pluralLabel,
    description: input.description ?? "",
    icon: input.icon ?? "Box",
    route: input.route,
    isSystem: false,
    businessId: input.businessId,
    fields: input.fields,
    applicableActions: input.applicableActions,
    sortOrder: (maxSortOrder?.sortOrder ?? 0) + 1,
    enabled: true,
    createdBy: input.createdBy,
  });

  // This is the actual "map access to every module" step: the moment a
  // module exists, a full set of grantable permissions exists for it too —
  // no developer has to remember to add them, and no module can end up
  // permission-less the way several original-repo modules effectively were.
  await syncPermissionsForModule(moduleDef);
  await syncSuperAdminRole();
  // NOTE: syncManagerRole() deliberately no longer called here -- it
  // auto-recreated a global, all-permission MANAGER role every time a
  // module was created, which contradicts the final architecture's
  // "no default roles; every role is created explicitly per business by
  // the Super Admin" rule.

  return moduleDef;
}

/**
 * List every module available to a business: platform-wide system modules
 * (businessId: null) plus that business's own custom modules. This is what
 * drives the sidebar/nav — the single source of truth for "what modules
 * does this business see," replacing the hardcoded route list currently in
 * sidebar.tsx.
 */
export async function listModulesForBusiness(businessId: string): Promise<LeanModuleDefinition[]> {
  return ModuleDefinition.find({
    $or: [{ businessId: null }, { businessId }],
    enabled: true,
  })
    .sort({ sortOrder: 1 })
    .lean();
}

export async function getModuleDefinition(
  key: string,
  businessId: string
): Promise<LeanModuleDefinition | null> {
  return ModuleDefinition.findOne({
    key,
    $or: [{ businessId: null }, { businessId }],
  }).lean();
}

export async function updateModuleDefinition(
  key: string,
  businessId: string,
  updates: Partial<Pick<IModuleDefinition, "label" | "pluralLabel" | "description" | "icon" | "fields" | "applicableActions" | "enabled" | "sortOrder">>
): Promise<IModuleDefinition | null> {
  const moduleDef = await ModuleDefinition.findOne({ key, businessId });
  if (!moduleDef) {
    throw new Error(`Custom module "${key}" not found for this business, or it is a system module and cannot be edited here.`);
  }
  Object.assign(moduleDef, updates);
  await moduleDef.save();

  // Re-sync whenever label or applicableActions change, since both feed
  // into the generated Permission rows (label -> permission name/description,
  // applicableActions -> which permissions exist at all).
  if (updates.applicableActions !== undefined || updates.label !== undefined) {
    await syncPermissionsForModule(moduleDef);
    await syncSuperAdminRole();
  }

  return moduleDef.toObject();
}

/**
 * Delete a custom module definition. System modules can never be deleted
 * through this path (isSystem is never true for anything businessId-scoped,
 * enforced by the query filter here, not just a runtime check).
 */
export async function deleteModuleDefinition(key: string, businessId: string): Promise<void> {
  const result = await ModuleDefinition.deleteOne({ key, businessId, isSystem: false });
  if (result.deletedCount === 0) {
    throw new Error(`Custom module "${key}" not found for this business, or it cannot be deleted.`);
  }
}
