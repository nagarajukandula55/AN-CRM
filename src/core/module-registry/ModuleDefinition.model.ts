import mongoose, { Schema, Document, Model } from "mongoose";
import type { FieldType } from "./types";

/**
 * ModuleDefinition — the Mongoose-persisted form of a module's field schema.
 * See ./types.ts for the full design rationale.
 */

export interface IFieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  unique?: boolean;
  defaultValue?: unknown;
  options?: { value: string; label: string }[];
  referenceModuleKey?: string;
  helpText?: string;
  validation?: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
  };
}

const FieldDefinitionSchema = new Schema<IFieldDefinition>(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    type: {
      type: String,
      required: true,
      enum: [
        "text", "textarea", "number", "boolean", "date",
        "select", "multiselect", "reference", "email", "phone",
        "currency", "richtext",
      ],
    },
    required: { type: Boolean, default: false },
    unique: { type: Boolean, default: false },
    defaultValue: { type: Schema.Types.Mixed },
    options: [{ value: String, label: String, _id: false }],
    referenceModuleKey: { type: String },
    helpText: { type: String },
    validation: {
      minLength: Number,
      maxLength: Number,
      min: Number,
      max: Number,
      pattern: String,
    },
  },
  { _id: false }
);

export interface IModuleDefinition extends Document {
  key: string;
  label: string;
  pluralLabel: string;
  description?: string;
  icon?: string;
  route: string;
  isSystem: boolean;
  businessId: mongoose.Types.ObjectId | null;
  fields: IFieldDefinition[];
  // Which of core/access/actions.ts's STANDARD_ACTIONS actually make sense
  // for this module (e.g. a read-only reporting module might only need
  // ["view", "export"]). Empty/undefined means "all standard actions apply"
  // — see resolveActionsForModule() in core/access/actions.ts.
  applicableActions?: string[];
  sortOrder: number;
  enabled: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ModuleDefinitionSchema = new Schema<IModuleDefinition>(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    pluralLabel: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    icon: { type: String, default: "Box" },
    route: { type: String, required: true },
    isSystem: { type: Boolean, default: false, index: true },
    businessId: {
      type: Schema.Types.ObjectId,
      ref: "Business",
      default: null,
      index: true,
    },
    fields: { type: [FieldDefinitionSchema], default: [] },
    applicableActions: { type: [String], default: undefined },
    sortOrder: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// A module key must be unique WITHIN a business's custom modules, and
// system modules (businessId: null) are unique platform-wide. This lets
// two different businesses each create their own "warranty_claim" custom
// module without colliding, while still preventing accidental duplicate
// system modules.
ModuleDefinitionSchema.index({ key: 1, businessId: 1 }, { unique: true });

const ModuleDefinition: Model<IModuleDefinition> =
  (mongoose.models.ModuleDefinition as Model<IModuleDefinition>) ||
  mongoose.model<IModuleDefinition>("ModuleDefinition", ModuleDefinitionSchema);

export default ModuleDefinition;
