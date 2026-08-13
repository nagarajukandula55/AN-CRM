/**
 * Super-admin-configurable column visibility/order/labels for vendor list
 * pages. Platform-wide (not per-business) -- one admin-controlled default
 * that every vendor sees, not a per-vendor customization. A page registers
 * its own `pageKey` (e.g. "jobsheets") and its own hardcoded default column
 * set as a fallback; this model only stores what's been overridden from
 * that default via the admin Page Columns screen.
 */
import mongoose, { Schema, Model, Document } from "mongoose";

export interface IPageColumnConfigColumn {
  key: string;
  defaultLabel: string;
  label: string;
  visible: boolean;
  order: number;
}

export interface IPageColumnConfig extends Document {
  pageKey: string;
  columns: IPageColumnConfigColumn[];
  createdAt: Date;
  updatedAt: Date;
}

const PageColumnConfigColumnSchema = new Schema<IPageColumnConfigColumn>(
  {
    key: { type: String, required: true },
    defaultLabel: { type: String, required: true },
    label: { type: String, required: true },
    visible: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const PageColumnConfigSchema = new Schema<IPageColumnConfig>(
  {
    pageKey: { type: String, required: true, unique: true, index: true },
    columns: { type: [PageColumnConfigColumnSchema], default: [] },
  },
  { timestamps: true }
);

const PageColumnConfig: Model<IPageColumnConfig> =
  (mongoose.models.PageColumnConfig as Model<IPageColumnConfig>) ||
  mongoose.model<IPageColumnConfig>("PageColumnConfig", PageColumnConfigSchema);

export default PageColumnConfig;
