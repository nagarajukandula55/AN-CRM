/**
 * Module Registry — type definitions
 *
 * This is the foundation of the "admin can define new modules from the UI"
 * requirement (Option A from the rebuild plan). A ModuleDefinition describes
 * a business object type (its fields, validation rules, and how it shows up
 * in navigation) as DATA, not as a hardcoded Mongoose schema + React form.
 *
 * Built-in modules (inventory, sales, etc.) are seeded as ModuleDefinitions
 * too, so there is exactly one system for "what modules exist and what
 * fields they have" — not one hardcoded path for built-ins and a separate
 * dynamic path for admin-created ones. This is what keeps the platform from
 * re-accumulating the kind of duplication found in the original repo (e.g.
 * three different "product" models with drifted fields) — every module,
 * built-in or custom, is described the same way in the same place.
 */

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "date"
  | "select"       // single choice from `options`
  | "multiselect"   // multiple choices from `options`
  | "reference"     // references a document in another module (by moduleKey + recordId)
  | "email"
  | "phone"
  | "currency"
  | "richtext";

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDefinition {
  key: string;                  // stable machine key, e.g. "invoiceNumber"
  label: string;                // human label shown in UI, e.g. "Invoice Number"
  type: FieldType;
  required: boolean;
  unique?: boolean;
  defaultValue?: unknown;
  options?: FieldOption[];       // for select/multiselect
  referenceModuleKey?: string;   // for type: "reference" — which module this points to
  helpText?: string;
  // Validation, intentionally simple and declarative (not arbitrary code) so
  // custom-field validation stays safe and predictable for admin-authored
  // modules. Extend this list deliberately, not by allowing raw expressions.
  validation?: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string; // regex source, applied with new RegExp(pattern)
  };
}

export interface ModuleDefinition {
  key: string;                 // stable machine key, e.g. "inventory_item"
  label: string;                // e.g. "Inventory Item"
  pluralLabel: string;           // e.g. "Inventory Items"
  description?: string;
  icon?: string;                 // lucide-react icon name, matches existing sidebar.tsx convention
  route: string;                 // e.g. "/admin/inventory" — matches existing sidebar route pattern
  isSystem: boolean;              // true for built-in modules (inventory, sales, ...) — cannot be deleted from UI
  businessId: string | null;      // null = platform-wide/system module available to all businesses;
                                   // set = a business-specific custom module created by that business's admin
  fields: FieldDefinition[];
  sortOrder: number;
  enabled: boolean;
  createdBy?: string;             // userId of the admin who created a custom module
  createdAt: Date;
  updatedAt: Date;
}
