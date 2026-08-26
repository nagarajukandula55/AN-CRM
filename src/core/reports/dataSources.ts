/**
 * Explicit allowlist of what a saved ReportDefinition may query -- source
 * model, which fields are selectable, and which are filterable/groupable.
 * Never expose a field here that isn't meant to be report-visible (no
 * password hashes, no internal-only flags).
 */
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
  /** Which field on this source's own schema isolates one vendor's rows
   * from another's when a report is run as a vendor (not business-level
   * staff) -- "vendorId" for the CRM-native sources, "_id" for VENDORS
   * itself (a vendor may only ever see their own profile row, never list
   * every vendor on the platform). Undefined means this source has no
   * per-vendor concept and stays business-wide for everyone. */
  vendorScopeField?: string;
}

export const DATA_SOURCES: Record<ReportDataSource, DataSourceDef> = {
  CRM_JOBSHEETS: {
    model: CrmJobSheet,
    label: "Workorders",
    dateField: "createdAt",
    fields: [
      { key: "jobSheetNumber", label: "Workorder Number", type: "string" },
      { key: "customerName", label: "Customer Name", type: "string" },
      { key: "phone", label: "Phone", type: "string" },
      { key: "company", label: "Company", type: "string" },
      { key: "title", label: "Title", type: "string" },
      { key: "product", label: "Product", type: "string" },
      { key: "deviceModel", label: "Device Model", type: "string" },
      { key: "imeiOrSerialNumber", label: "IMEI / Serial Number", type: "string" },
      { key: "status", label: "Status", type: "enum" },
      { key: "warrantyStatus", label: "Warranty Status", type: "enum" },
      { key: "assignedToName", label: "Engineer", type: "string" },
      { key: "ccoName", label: "CCO", type: "string" },
      { key: "serviceCharge", label: "Service Charge", type: "number" },
      { key: "createdAt", label: "Created At", type: "date" },
      { key: "engineerAssignedAt", label: "Engineer Assigned At", type: "date" },
      { key: "repairInProgressAt", label: "Repair In Progress At", type: "date" },
      { key: "partPendingAt", label: "Part Pending At", type: "date" },
      { key: "repairResumedAt", label: "Repair Resumed At", type: "date" },
      { key: "completedAt", label: "Completed At", type: "date" },
      { key: "handedOverAt", label: "Handed Over At", type: "date" },
    ],
    vendorScopeField: "vendorId",
  },
  SALES_INVOICES: {
    model: SalesInvoice,
    label: "Invoices",
    dateField: "createdAt",
    fields: [
      { key: "invoiceNumber", label: "Invoice Number", type: "string" },
      { key: "invoiceType", label: "Type", type: "enum" },
      { key: "status", label: "Status", type: "enum" },
      { key: "subtotal", label: "Subtotal", type: "number" },
      { key: "grandTotal", label: "Grand Total", type: "number" },
      { key: "taxTotal", label: "Tax Total", type: "number" },
      { key: "discountAmount", label: "Discount", type: "number" },
      { key: "salesExecutiveName", label: "Sales Executive", type: "string" },
      { key: "createdAt", label: "Created At", type: "date" },
      { key: "dueDate", label: "Due Date", type: "date" },
      { key: "paidAt", label: "Payment Date", type: "date" },
    ],
    vendorScopeField: "vendorId",
  },
  VENDORS: {
    model: VendorProfile,
    label: "Vendors",
    dateField: "createdAt",
    fields: [
      { key: "vendorId", label: "Vendor ID", type: "string" },
      { key: "companyName", label: "Company Name", type: "string" },
      { key: "contactPerson", label: "Contact Person", type: "string" },
      { key: "email", label: "Email", type: "string" },
      { key: "phone", label: "Phone", type: "string" },
      { key: "appliedAs", label: "Applied As", type: "enum" },
      { key: "isApproved", label: "Approved", type: "string" },
      { key: "createdAt", label: "Created At", type: "date" },
    ],
    vendorScopeField: "_id",
  },
  CUSTOMERS: {
    model: Customer,
    label: "Customers",
    dateField: "createdAt",
    fields: [
      { key: "name", label: "Name", type: "string" },
      { key: "phone", label: "Phone", type: "string" },
      { key: "email", label: "Email", type: "string" },
      { key: "city", label: "City", type: "string" },
      { key: "state", label: "State", type: "string" },
      { key: "imeiOrSerialNumbers", label: "IMEI / Serial Numbers", type: "string" },
      { key: "source", label: "Source", type: "string" },
      { key: "sourceModule", label: "Source Module", type: "string" },
      { key: "createdAt", label: "Created At", type: "date" },
    ],
    vendorScopeField: "vendorId",
  },
};

export function isValidField(source: ReportDataSource, field: string): boolean {
  return DATA_SOURCES[source]?.fields.some((f) => f.key === field) ?? false;
}
