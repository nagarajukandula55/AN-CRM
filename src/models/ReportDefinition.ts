/**
 * ReportDefinition — a saved custom report: which data source, which
 * fields, which filters, how to chart it, and (optionally) an email
 * schedule. Per explicit direction ("Reports ... give them to customise
 * anything or create any report" + "Go with the fuller builder -- saved
 * reports, scheduling, charts").
 *
 * Data sources are an explicit allowlist (not an arbitrary collection
 * name) so this can never be used to query a model outside what's
 * intentionally exposed -- see core/reports/dataSources.ts for the exact
 * fields/filters each source supports.
 */

import mongoose, { Schema, Model, Document, Types } from "mongoose";

export type ReportDataSource = "CRM_CALLS" | "CRM_JOBSHEETS" | "SALES_INVOICES" | "VENDORS" | "CUSTOMERS";
export type ChartType = "TABLE" | "BAR" | "LINE" | "PIE";
export type ScheduleFrequency = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";

export interface IReportFilter {
  field: string;
  operator: "equals" | "in" | "gte" | "lte" | "between";
  value: unknown;
}

export interface IReportDefinition extends Document {
  businessId: Types.ObjectId;
  name: string;
  dataSource: ReportDataSource;
  fields: string[]; // subset of the data source's allowed fields
  filters: IReportFilter[];
  groupByField?: string; // for BAR/PIE chart aggregation
  chartType: ChartType;
  schedule: {
    frequency: ScheduleFrequency;
    recipientEmails: string[];
    // When on, the same run also posts a compact text summary to this
    // business's Business.telegramChatId (Settings > Operations) via our
    // shared Telegram bot -- see api/cron/run-scheduled-reports.
    sendToTelegram?: boolean;
    lastRunAt?: Date;
    nextRunAt?: Date;
  };
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ReportFilterSchema = new Schema<IReportFilter>(
  {
    field: { type: String, required: true },
    operator: { type: String, enum: ["equals", "in", "gte", "lte", "between"], required: true },
    value: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const ReportDefinitionSchema = new Schema<IReportDefinition>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    name: { type: String, required: true, trim: true },
    dataSource: { type: String, enum: ["CRM_CALLS", "CRM_JOBSHEETS", "SALES_INVOICES", "VENDORS", "CUSTOMERS"], required: true },
    fields: { type: [String], default: [] },
    filters: { type: [ReportFilterSchema], default: [] },
    groupByField: { type: String },
    chartType: { type: String, enum: ["TABLE", "BAR", "LINE", "PIE"], default: "TABLE" },
    schedule: {
      frequency: { type: String, enum: ["NONE", "DAILY", "WEEKLY", "MONTHLY"], default: "NONE" },
      recipientEmails: { type: [String], default: [] },
      sendToTelegram: { type: Boolean, default: false },
      lastRunAt: { type: Date },
      nextRunAt: { type: Date },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

ReportDefinitionSchema.index({ businessId: 1, createdAt: -1 });
ReportDefinitionSchema.index({ "schedule.frequency": 1, "schedule.nextRunAt": 1 });

const ReportDefinition: Model<IReportDefinition> =
  (mongoose.models.ReportDefinition as Model<IReportDefinition>) ||
  mongoose.model<IReportDefinition>("ReportDefinition", ReportDefinitionSchema);

export default ReportDefinition;
