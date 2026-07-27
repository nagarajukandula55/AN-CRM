/**
 * InvoiceTemplate — admin-editable invoice designs for the ecommerce
 * order-invoice system (the Invoice model / app/invoice/[invoiceNumber]
 * page — the "invoice page I'm using for current ecommerce" the user
 * pointed at, NOT the separate B2B SalesInvoice/finance system).
 *
 * Built per explicit user request: "make multiple invoice templates that
 * we can edit." Scope, per the user's own choice: a fixed set of
 * pre-built LAYOUTS (see invoiceTemplates/registry.ts) that admins pick
 * from and customize branding/text on — not a freeform drag-and-drop
 * layout editor (a much bigger, separate project). One InvoiceTemplate
 * document per (businessId, layoutKey) combination an admin has
 * customized; the layout's actual HTML/CSS structure lives in code
 * (invoiceTemplates/layouts/*.ts), this model only stores what's
 * editable on top of it.
 */

import mongoose, { Schema, Model, Document } from "mongoose";

/** Must match a key in invoiceTemplates/registry.ts's LAYOUTS map. */
export type InvoiceLayoutKey = "classic-gst" | "minimal" | "modern-colorblock";

export interface IInvoiceTemplate extends Document {
  businessId: mongoose.Types.ObjectId;
  layoutKey: InvoiceLayoutKey;
  /** Display name for this saved customization, e.g. "Default", "Festive Sale" */
  name: string;
  isDefault: boolean;
  branding: {
    logoUrl?: string;
    /** Primary accent color (hex), used for headers/table header background depending on layout. */
    accentColor?: string;
    tagline?: string;
  };
  /** Editable text blocks — every layout renders these where it has a slot for them. */
  text: {
    footerNote?: string;
    declaration?: string;
    termsAndConditions?: string;
    showSignature?: boolean;
    signatureImageUrl?: string;
    signatoryLabel?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceTemplateSchema = new Schema<IInvoiceTemplate>(
  {
    businessId: { type: Schema.Types.ObjectId, required: true, index: true },
    layoutKey: {
      type: String,
      enum: ["classic-gst", "minimal", "modern-colorblock"],
      required: true,
    },
    name: { type: String, required: true, default: "Default" },
    isDefault: { type: Boolean, default: false },
    branding: {
      logoUrl: { type: String },
      accentColor: { type: String, default: "#111827" },
      tagline: { type: String, default: "" },
    },
    text: {
      footerNote: { type: String, default: "This is a computer generated GST invoice." },
      declaration: {
        type: String,
        default: "Certified that the particulars given above are true and correct. This invoice is generated electronically and does not require a physical signature.",
      },
      termsAndConditions: { type: String, default: "" },
      showSignature: { type: Boolean, default: true },
      signatureImageUrl: { type: String, default: "" },
      signatoryLabel: { type: String, default: "Authorized Signatory" },
    },
  },
  { timestamps: true }
);

// One admin picks one default template per business at a time — enforced by
// application logic in invoiceTemplates/service.ts (unsetting a previous
// default before setting a new one), not a schema-level unique constraint,
// since MongoDB can't express "at most one true" directly without a partial
// index; a partial index is used below instead.
InvoiceTemplateSchema.index(
  { businessId: 1, isDefault: 1 },
  { unique: true, partialFilterExpression: { isDefault: true } }
);

const InvoiceTemplate: Model<IInvoiceTemplate> =
  (mongoose.models.InvoiceTemplate as Model<IInvoiceTemplate>) ||
  mongoose.model<IInvoiceTemplate>("InvoiceTemplate", InvoiceTemplateSchema);

export default InvoiceTemplate;
