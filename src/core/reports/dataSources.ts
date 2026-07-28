/**
 * Explicit allowlist of what a saved ReportDefinition may query -- source
 * model, which fields are selectable, and which are filterable/groupable.
 * Never expose a field here that isn't meant to be report-visible (no
 * password hashes, no internal-only flags).
 */
import CrmCall from "@/models/CrmCall";
import CrmJobSheet from "@/models/CrmJobSheet";
import SalesInvoice from "@/models/SalesInvoice";
import VendorProfile from "@/models/VendorProfile";
import Customer from "@/models/Customer";
import type { ReportDataSource } from "@/models/ReportDefinition";

export interface DataSourceDef {
  model: any;
  label: string;
  dateField: string; // used for filtering/grouping by time
  fields: { key: string; label: string; type: "string" | "number" | "date" | "enum" }[];
}

export const DATA_SOURCES: Record<ReportDataSource, DataSourceDef> = {
  CRM_CALLS: {
    model: CrmCall,
    label: "Calls",
    dateField: "createdAt",
    fields: [
      { key: "callNumber", label: "Call Number", type: "string" },
      { key: "customerName", label: "Customer Name", type: "string" },
      { key: "phone", label: "Phone", type: "string" },
      { key: "status", label: "Status", type: "enum" },
      { key: "priority", label: "Priority", type: "enum" },
      { key: "estimatedValue", label: "Estimated Value", type: "number" },
      { key: "createdAt", label: "Created At", type: "date" },
    ],
  },
  CRM_JOBSHEETS: {
    model: CrmJobSheet,
    label: "Workorders",
    dateField: "createdAt",
    fields: [
      { key: "jobSheetNumber", label: "Workorder Number", type: "string" },
      { key: "customerName", label: "Customer Name", type: "string" },
      { key: "status", label: "Status", type: "enum" },
      { key: "assignedToName", label: "Engineer", type: "string" },
      { key: "ccoName", label: "CCO", type: "string" },
      { key: "serviceCharge", label: "Service Charge", type: "number" },
      { key: "createdAt", label: "Created At", type: "date" },
      { key: "completedAt", label: "Completed At", type: "date" },
    ],
  },
  SALES_INVOICES: {
    model: SalesInvoice,
    label: "Invoices",
    dateField: "createdAt",
    fields: [
      { key: "invoiceNumber", label: "Invoice Number", type: "string" },
      { key: "invoiceType", label: "Type", type: "enum" },
      { key: "status", label: "Status", type: "enum" },
      { key: "grandTotal", label: "Grand Total", type: "number" },
      { key: "taxTotal", label: "Tax Total", type: "number" },
      { key: "salesExecutiveName", label: "Sales Executive", type: "string" },
      { key: "createdAt", label: "Created At", type: "date" },
    ],
  },
  VENDORS: {
    model: VendorProfile,
    label: "Vendors",
    dateField: "createdAt",
    fields: [
      { key: "vendorId", label: "Vendor ID", type: "string" },
      { key: "companyName", label: "Company Name", type: "string" },
      { key: "appliedAs", label: "Applied As", type: "enum" },
      { key: "isApproved", label: "Approved", type: "string" },
      { key: "createdAt", label: "Created At", type: "date" },
    ],
  },
  CUSTOMERS: {
    model: Customer,
    label: "Customers",
    dateField: "createdAt",
    fields: [
      { key: "name", label: "Name", type: "string" },
      { key: "phone", label: "Phone", type: "string" },
      { key: "email", label: "Email", type: "string" },
      { key: "source", label: "Source", type: "string" },
      { key: "createdAt", label: "Created At", type: "date" },
    ],
  },
};

export function isValidField(source: ReportDataSource, field: string): boolean {
  return DATA_SOURCES[source]?.fields.some((f) => f.key === field) ?? false;
}
