/**
 * HsnTaxRate — simple HSN-code -> GST-rate lookup used to auto-fill the
 * tax% on a CrmJobSheet line item when a part is picked from
 * ServiceCenterBOM by its hsnCode. businessId-scoped, with a null
 * businessId meaning a global/platform default (falls back to these if a
 * business hasn't defined its own override for a given HSN code).
 *
 * NOTE: the seeded rates below are reasonable placeholders for common
 * electronics-repair HSN codes as of this writing — real HSN-to-GST-rate
 * mapping should be reviewed/confirmed by the business owner /
 * accountant, since GST rates and HSN classifications can change.
 */

import mongoose, { Schema, Model, Document, Types } from "mongoose";

export interface IHsnTaxRate extends Document {
  businessId?: Types.ObjectId | null;
  hsnCode: string;
  gstRate: number;
  // Free text GST category label (e.g. "Goods"/"Services", or a
  // business-defined grouping) -- no fixed taxonomy is imposed.
  category?: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const HsnTaxRateSchema = new Schema<IHsnTaxRate>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", default: null, index: true },
    hsnCode: { type: String, required: true, trim: true, index: true },
    gstRate: { type: Number, required: true },
    category: { type: String, trim: true },
    description: { type: String, trim: true },
  },
  { timestamps: true }
);

HsnTaxRateSchema.index({ businessId: 1, hsnCode: 1 }, { unique: true });

const HsnTaxRate: Model<IHsnTaxRate> =
  (mongoose.models.HsnTaxRate as Model<IHsnTaxRate>) ||
  mongoose.model<IHsnTaxRate>("HsnTaxRate", HsnTaxRateSchema);

export default HsnTaxRate;

// Placeholder starter set for common electronics-repair HSN codes — review before relying on it for compliance.
export const DEFAULT_HSN_TAX_RATES: Array<Pick<IHsnTaxRate, "hsnCode" | "gstRate" | "description">> = [
  { hsnCode: "8517", gstRate: 18, description: "Mobile phone parts & accessories" },
  { hsnCode: "8528", gstRate: 18, description: "TV / display panel parts" },
  { hsnCode: "8544", gstRate: 18, description: "Cables and wires" },
  { hsnCode: "8507", gstRate: 18, description: "Batteries" },
  { hsnCode: "8536", gstRate: 18, description: "Switches, connectors, relays" },
  { hsnCode: "8471", gstRate: 18, description: "Computer / laptop parts" },
  { hsnCode: "8518", gstRate: 18, description: "Speakers, microphones, headphones" },
  { hsnCode: "9999", gstRate: 18, description: "Generic service / labour charge" },
  // Food/grocery starter set — placeholders too, same disclaimer as above.
  // Real HSN classification for packaged food depends on branding/packaging
  // specifics under current GST rules; confirm with an accountant before
  // invoicing off these.
  { hsnCode: "1508", gstRate: 5, description: "Groundnut oil, crude and refined" },
  { hsnCode: "1509", gstRate: 5, description: "Olive oil" },
  { hsnCode: "1512", gstRate: 5, description: "Sunflower / safflower / cottonseed oil" },
  { hsnCode: "1515", gstRate: 5, description: "Other fixed vegetable/cold-pressed oils" },
  { hsnCode: "1101", gstRate: 5, description: "Wheat or meslin flour" },
  { hsnCode: "1102", gstRate: 5, description: "Cereal flours other than wheat (ragi, etc.)" },
  { hsnCode: "1106", gstRate: 5, description: "Flour/meal of dried legumes, sago, roots" },
  { hsnCode: "1904", gstRate: 18, description: "Prepared foods from cereal flakes/flour (instant mixes, etc.)" },
  { hsnCode: "2106", gstRate: 18, description: "Food preparations not elsewhere specified (ready-to-cook mixes)" },
  { hsnCode: "2103", gstRate: 12, description: "Sauces, condiments, mixed seasonings" },
  { hsnCode: "0713", gstRate: 5, description: "Dried leguminous vegetables (pulses)" },
  { hsnCode: "3923", gstRate: 18, description: "Plastic packaging: pouches, containers, caps" },
  { hsnCode: "4819", gstRate: 18, description: "Cartons, boxes, cases of paper/paperboard" },
  { hsnCode: "7010", gstRate: 18, description: "Glass jars/bottles for packing" },
];
