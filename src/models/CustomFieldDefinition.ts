import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * A single admin/vendor-defined extra field on one of the system's forms
 * -- the generic engine behind "add/remove columns on any form, mark
 * mandatory or optional, choose the input type" (per explicit direction).
 *
 * Scoping: vendorId is nullable -- null means a PLATFORM-WIDE default
 * (set by a super admin, applies to every vendor using that form who
 * hasn't defined their own), a real vendorId means that ONE vendor's own
 * custom field (their shop wants a field nobody else needs). Same
 * private-with-shared-default pattern already used elsewhere in this app
 * (Brand/DeviceModel). A vendor's own fields are layered on TOP of
 * platform defaults for the same formKey, not instead of them.
 *
 * Values themselves are never stored here -- each target document
 * (CrmJobSheet, Customer, SalesInvoice, SalesDocument, ...) has its own
 * `customFields: Record<string, any>` Mixed field; this model only
 * defines the SHAPE (which keys exist, what type, mandatory or not).
 * Deliberately not literal schema columns -- that would need a real
 * migration every time a field is added/removed, defeating the point of
 * a self-serve "add/remove anytime" builder.
 */
export const CUSTOM_FIELD_FORMS = [
  "JOBSHEET",
  "CUSTOMER",
  "SALES_INVOICE",
  "QUOTATION",
  "CREDIT_NOTE",
  "DEBIT_NOTE",
  "PROFORMA_INVOICE",
] as const;
export type CustomFieldForm = (typeof CUSTOM_FIELD_FORMS)[number];

export const CUSTOM_FIELD_INPUT_TYPES = ["TEXT", "TEXTAREA", "NUMBER", "DATE", "SELECT", "CHECKBOX"] as const;
export type CustomFieldInputType = (typeof CUSTOM_FIELD_INPUT_TYPES)[number];

export interface ICustomFieldDefinition extends Document {
  businessId: mongoose.Types.ObjectId;
  vendorId: mongoose.Types.ObjectId | null;
  formKey: CustomFieldForm;
  fieldKey: string;
  label: string;
  inputType: CustomFieldInputType;
  /** Only meaningful for inputType "SELECT" -- the dropdown's choices. */
  options: string[];
  mandatory: boolean;
  order: number;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CustomFieldDefinitionSchema = new Schema<ICustomFieldDefinition>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "VendorProfile", default: null, index: true },
    formKey: { type: String, enum: CUSTOM_FIELD_FORMS, required: true, index: true },
    // Slug derived from label at creation time -- stable even if the
    // label is later edited, since it's the actual storage key inside
    // every document's customFields object.
    fieldKey: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    inputType: { type: String, enum: CUSTOM_FIELD_INPUT_TYPES, required: true, default: "TEXT" },
    options: { type: [String], default: [] },
    mandatory: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

CustomFieldDefinitionSchema.index({ businessId: 1, vendorId: 1, formKey: 1, fieldKey: 1 }, { unique: true });

const CustomFieldDefinition: Model<ICustomFieldDefinition> =
  mongoose.models.CustomFieldDefinition ||
  mongoose.model<ICustomFieldDefinition>("CustomFieldDefinition", CustomFieldDefinitionSchema);

export default CustomFieldDefinition;
