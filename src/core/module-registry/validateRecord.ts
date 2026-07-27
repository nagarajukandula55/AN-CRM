import type { IModuleDefinition, IFieldDefinition } from "./ModuleDefinition.model";

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validates a plain data object against a ModuleDefinition's field list.
 * This is the application-layer enforcement that stands in for a real
 * Mongoose schema, since ModuleRecord.data is intentionally schema-less
 * (see ModuleRecord.model.ts for why).
 *
 * Deliberately simple and declarative — no arbitrary code execution, no
 * eval, no admin-authored validation functions. If a use case needs
 * validation this can't express, that's a signal the concept belongs in a
 * real built-in module (src/modules/<domain>/), not a custom one.
 */
export function validateRecord(
  moduleDef: Pick<IModuleDefinition, "fields">,
  data: Record<string, unknown>
): ValidationResult {
  const errors: ValidationError[] = [];

  for (const field of moduleDef.fields) {
    const value = data[field.key];
    const isEmpty = value === undefined || value === null || value === "";

    if (field.required && isEmpty) {
      errors.push({ field: field.key, message: `${field.label} is required.` });
      continue;
    }

    if (isEmpty) continue; // optional and not provided — nothing further to check

    const fieldErrors = validateFieldValue(field, value);
    errors.push(...fieldErrors);
  }

  return { valid: errors.length === 0, errors };
}

function validateFieldValue(field: IFieldDefinition, value: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const v = field.validation;

  switch (field.type) {
    case "text":
    case "textarea":
    case "richtext":
    case "email":
    case "phone": {
      if (typeof value !== "string") {
        errors.push({ field: field.key, message: `${field.label} must be text.` });
        break;
      }
      if (v?.minLength !== undefined && value.length < v.minLength) {
        errors.push({ field: field.key, message: `${field.label} must be at least ${v.minLength} characters.` });
      }
      if (v?.maxLength !== undefined && value.length > v.maxLength) {
        errors.push({ field: field.key, message: `${field.label} must be at most ${v.maxLength} characters.` });
      }
      if (v?.pattern) {
        try {
          if (!new RegExp(v.pattern).test(value)) {
            errors.push({ field: field.key, message: `${field.label} is not in the expected format.` });
          }
        } catch {
          // A malformed admin-authored pattern must never crash record
          // validation for end users — skip pattern check rather than throw.
        }
      }
      if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        errors.push({ field: field.key, message: `${field.label} must be a valid email address.` });
      }
      break;
    }

    case "number":
    case "currency": {
      const num = typeof value === "number" ? value : Number(value);
      if (Number.isNaN(num)) {
        errors.push({ field: field.key, message: `${field.label} must be a number.` });
        break;
      }
      if (v?.min !== undefined && num < v.min) {
        errors.push({ field: field.key, message: `${field.label} must be at least ${v.min}.` });
      }
      if (v?.max !== undefined && num > v.max) {
        errors.push({ field: field.key, message: `${field.label} must be at most ${v.max}.` });
      }
      break;
    }

    case "boolean": {
      if (typeof value !== "boolean") {
        errors.push({ field: field.key, message: `${field.label} must be true or false.` });
      }
      break;
    }

    case "date": {
      const d = new Date(value as string);
      if (Number.isNaN(d.getTime())) {
        errors.push({ field: field.key, message: `${field.label} must be a valid date.` });
      }
      break;
    }

    case "select": {
      const valid = field.options?.some((o) => o.value === value);
      if (!valid) {
        errors.push({ field: field.key, message: `${field.label} must be one of the allowed options.` });
      }
      break;
    }

    case "multiselect": {
      if (!Array.isArray(value)) {
        errors.push({ field: field.key, message: `${field.label} must be a list of values.` });
        break;
      }
      const allowed = new Set(field.options?.map((o) => o.value) ?? []);
      for (const item of value) {
        if (!allowed.has(item as string)) {
          errors.push({ field: field.key, message: `${field.label} contains an invalid option: ${item}.` });
        }
      }
      break;
    }

    case "reference": {
      if (typeof value !== "string" || value.length === 0) {
        errors.push({ field: field.key, message: `${field.label} must reference a valid record id.` });
      }
      break;
    }

    default:
      break;
  }

  return errors;
}
