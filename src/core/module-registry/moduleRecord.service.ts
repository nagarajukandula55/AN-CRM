import type { FlattenMaps, Types } from "mongoose";
import ModuleRecord, { IModuleRecord } from "./ModuleRecord.model";
import { getModuleDefinition } from "./moduleDefinition.service";
import { validateRecord } from "./validateRecord";

// .lean() returns plain objects shaped by FlattenMaps<T>, not the Document
// interface itself — using IModuleRecord[] directly as a lean-query return
// type doesn't match what Mongoose actually returns and fails `npm run
// build` under strict mode (same issue fixed in moduleDefinition.service.ts's
// LeanModuleDefinition).
export type LeanModuleRecord = FlattenMaps<IModuleRecord> & {
  _id: Types.ObjectId;
  __v: number;
};

export class ModuleRecordValidationError extends Error {
  constructor(public errors: { field: string; message: string }[]) {
    super("Record validation failed: " + errors.map((e) => e.message).join("; "));
    this.name = "ModuleRecordValidationError";
  }
}

/**
 * Create a record for any module (system or custom) that stores its data
 * via ModuleRecord — i.e. admin-defined custom modules. Built-in system
 * modules with real Mongoose models (inventory, orders, etc.) do NOT go
 * through this path; they use their own model + service directly.
 */
export async function createModuleRecord(
  moduleKey: string,
  businessId: string,
  data: Record<string, unknown>,
  userId: string
): Promise<IModuleRecord> {
  const moduleDef = await getModuleDefinition(moduleKey, businessId);
  if (!moduleDef) {
    throw new Error(`Module "${moduleKey}" not found.`);
  }

  const result = validateRecord(moduleDef, data);
  if (!result.valid) {
    throw new ModuleRecordValidationError(result.errors);
  }

  return ModuleRecord.create({
    moduleKey,
    businessId,
    data,
    createdBy: userId,
    updatedBy: userId,
  });
}

export async function updateModuleRecord(
  recordId: string,
  businessId: string,
  data: Record<string, unknown>,
  userId: string
): Promise<IModuleRecord> {
  const record = await ModuleRecord.findOne({ _id: recordId, businessId, isDeleted: false });
  if (!record) {
    throw new Error("Record not found.");
  }

  const moduleDef = await getModuleDefinition(record.moduleKey, businessId);
  if (!moduleDef) {
    throw new Error(`Module "${record.moduleKey}" not found.`);
  }

  const merged = { ...record.data, ...data };
  const result = validateRecord(moduleDef, merged);
  if (!result.valid) {
    throw new ModuleRecordValidationError(result.errors);
  }

  record.data = merged;
  record.updatedBy = userId as any;
  await record.save();
  return record;
}

export async function listModuleRecords(
  moduleKey: string,
  businessId: string,
  options: { limit?: number; skip?: number } = {}
): Promise<LeanModuleRecord[]> {
  return ModuleRecord.find({ moduleKey, businessId, isDeleted: false })
    .sort({ createdAt: -1 })
    .skip(options.skip ?? 0)
    .limit(options.limit ?? 50)
    .lean();
}

export async function softDeleteModuleRecord(recordId: string, businessId: string): Promise<void> {
  const result = await ModuleRecord.updateOne(
    { _id: recordId, businessId },
    { $set: { isDeleted: true } }
  );
  if (result.matchedCount === 0) {
    throw new Error("Record not found.");
  }
}
