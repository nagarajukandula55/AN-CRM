/**
 * Executes a saved ReportDefinition -- builds a safe Mongo query from its
 * allowlisted fields/filters (never trusts a raw client query), runs it
 * scoped to businessId, and returns rows plus (when groupByField is set) a
 * chart-ready aggregation.
 */
import { DATA_SOURCES, isValidField } from "./dataSources";
import type { IReportDefinition } from "@/models/ReportDefinition";

function buildMongoFilter(filters: IReportDefinition["filters"], dataSource: IReportDefinition["dataSource"]) {
  const query: Record<string, unknown> = {};
  for (const f of filters) {
    if (!isValidField(dataSource, f.field)) continue; // silently drop anything not allowlisted
    switch (f.operator) {
      case "equals":
        query[f.field] = f.value;
        break;
      case "in":
        query[f.field] = { $in: Array.isArray(f.value) ? f.value : [f.value] };
        break;
      case "gte":
        query[f.field] = { ...(query[f.field] as object), $gte: f.value };
        break;
      case "lte":
        query[f.field] = { ...(query[f.field] as object), $lte: f.value };
        break;
      case "between":
        if (Array.isArray(f.value) && f.value.length === 2) {
          query[f.field] = { $gte: f.value[0], $lte: f.value[1] };
        }
        break;
    }
  }
  return query;
}

export interface ReportResult {
  rows: Record<string, unknown>[];
  chartData?: { label: string; value: number }[];
}

export async function runReport(def: Pick<IReportDefinition, "businessId" | "dataSource" | "fields" | "filters" | "groupByField" | "chartType">): Promise<ReportResult> {
  const source = DATA_SOURCES[def.dataSource];
  if (!source) throw new Error("Unknown data source");

  const safeFields = def.fields.filter((f) => isValidField(def.dataSource, f));
  const projection = safeFields.length > 0 ? safeFields.join(" ") : source.fields.map((f) => f.key).join(" ");

  const mongoFilter = buildMongoFilter(def.filters, def.dataSource);
  mongoFilter.businessId = def.businessId;

  const rows = await source.model.find(mongoFilter).select(projection).sort({ [source.dateField]: -1 }).limit(1000).lean();

  let chartData: ReportResult["chartData"];
  if (def.chartType !== "TABLE" && def.groupByField && isValidField(def.dataSource, def.groupByField)) {
    const groups = new Map<string, number>();
    for (const row of rows as any[]) {
      const key = String(row[def.groupByField!] ?? "—");
      groups.set(key, (groups.get(key) || 0) + 1);
    }
    chartData = Array.from(groups.entries()).map(([label, value]) => ({ label, value }));
  }

  return { rows, chartData };
}
