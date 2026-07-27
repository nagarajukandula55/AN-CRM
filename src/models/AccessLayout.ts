import mongoose, { Schema, Document, Model, Types } from 'mongoose';

/**
 * One document per business, holding admin-authored overrides on top of
 * the built-in ACCESS_HIERARCHY (moduleHierarchy.ts). Lets an admin
 * create/rename/delete category and subcategory CONTAINERS and re-parent
 * real, already-enforced modules under them from the Admin > Access UI --
 * without ever inventing a new "module" that isn't backed by a real
 * requirePermission() check (that anti-pattern is exactly what
 * moduleHierarchy.ts's own comment warns against; see that file).
 *
 * businessId always points at a real Business document -- AN Group (the
 * platform owner) included, via its own real Business record (see
 * anGroupBusiness.service.ts) rather than a null/no-business sentinel.
 * This used to be a single global singleton document shared by every
 * business -- so a category added while looking at Business A silently
 * also appeared (and could get re-created under a fresh key) while
 * looking at Business B or AN Group, since there was nothing
 * distinguishing which "layout" a save applied to. Each business (AN
 * Group included) now gets its own row, upserted by {businessId}.
 */
export interface IAccessCategoryNode {
  key: string;
  label: string;
  // Empty string = top-level category; a category's own key = subcategory
  // under it. Categories/subcategories are never nested more than 2 deep.
  parentKey: string;
  order: number;
}

export interface IAccessLayout extends Document {
  businessId: Types.ObjectId;
  categories: IAccessCategoryNode[];
  // moduleKey -> category/subcategory key it's been moved under. Only
  // entries that differ from ACCESS_HIERARCHY's built-in placement need to
  // exist here.
  moduleParent: Map<string, string>;
  updatedAt: Date;
}

const AccessCategoryNodeSchema = new Schema<IAccessCategoryNode>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    parentKey: { type: String, default: "" },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const AccessLayoutSchema = new Schema<IAccessLayout>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, unique: true },
    categories: { type: [AccessCategoryNodeSchema], default: [] },
    moduleParent: { type: Map, of: String, default: {} },
  },
  { timestamps: true, versionKey: false }
);

const AccessLayout: Model<IAccessLayout> =
  mongoose.models.AccessLayout || mongoose.model<IAccessLayout>('AccessLayout', AccessLayoutSchema);

export default AccessLayout;
