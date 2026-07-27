/**
 * =========================================================
 * AN GROUP ERP PLATFORM
 * ---------------------------------------------------------
 * System Modules
 * ---------------------------------------------------------
 * Defines every functional module available in the ERP.
 *
 * These values are used by:
 * - RBAC Permission Engine
 * - Navigation
 * - Dashboard
 * - Audit Engine
 * - Notifications
 * - Workflow Engine
 *
 * NOTE:
 * Number Series must NEVER use modules directly.
 * Number Series should be attached to business entities
 * (Purchase Order, Vendor, Invoice, etc.).
 * =========================================================
 */

export enum SystemModule {
  /* ======================================================
   * PLATFORM
   * ====================================================== */

  PLATFORM = "PLATFORM",
  ADMINISTRATION = "ADMINISTRATION",
  SYSTEM_CONFIGURATION = "SYSTEM_CONFIGURATION",

  /* ======================================================
   * ORGANIZATION
   * ====================================================== */

  ORGANIZATION = "ORGANIZATION",
  BUSINESS = "BUSINESS",
  WAREHOUSE = "WAREHOUSE",

  /* ======================================================
   * USER MANAGEMENT
   * ====================================================== */

  USER = "USER",
  ROLE = "ROLE",
  PERMISSION = "PERMISSION",
  AUTHENTICATION = "AUTHENTICATION",

  /* ======================================================
   * MASTERS
   * ====================================================== */

  MASTER = "MASTER",
  MATERIAL = "MATERIAL",
  PRODUCT = "PRODUCT",
  BRAND = "BRAND",
  UNIT = "UNIT",
  VENDOR = "VENDOR",
  CUSTOMER = "CUSTOMER",
  EMPLOYEE = "EMPLOYEE",
  MACHINE = "MACHINE",
  ASSET = "ASSET",

  /* ======================================================
   * INVENTORY
   * ====================================================== */

  INVENTORY = "INVENTORY",
  STOCK = "STOCK",
  STOCK_TRANSFER = "STOCK_TRANSFER",
  STOCK_ADJUSTMENT = "STOCK_ADJUSTMENT",

  /* ======================================================
   * PURCHASE
   * ====================================================== */

  PURCHASE = "PURCHASE",
  PURCHASE_REQUEST = "PURCHASE_REQUEST",
  REQUEST_FOR_QUOTATION = "REQUEST_FOR_QUOTATION",
  PURCHASE_QUOTATION = "PURCHASE_QUOTATION",
  PURCHASE_ORDER = "PURCHASE_ORDER",
  GOODS_RECEIPT_NOTE = "GOODS_RECEIPT_NOTE",
  PURCHASE_RETURN = "PURCHASE_RETURN",

  /* ======================================================
   * SALES
   * ====================================================== */

  SALES = "SALES",
  SALES_QUOTATION = "SALES_QUOTATION",
  SALES_ORDER = "SALES_ORDER",
  DELIVERY_CHALLAN = "DELIVERY_CHALLAN",
  SALES_INVOICE = "SALES_INVOICE",
  SALES_RETURN = "SALES_RETURN",

  /* ======================================================
   * FINANCE
   * ====================================================== */

  FINANCE = "FINANCE",
  JOURNAL = "JOURNAL",
  RECEIPT = "RECEIPT",
  PAYMENT = "PAYMENT",
  EXPENSE = "EXPENSE",

  /* ======================================================
   * HR
   * ====================================================== */

  HUMAN_RESOURCES = "HUMAN_RESOURCES",
  ATTENDANCE = "ATTENDANCE",
  PAYROLL = "PAYROLL",
  LEAVE = "LEAVE",

  /* ======================================================
   * CRM
   * ====================================================== */

  CRM = "CRM",
  LEAD = "LEAD",
  OPPORTUNITY = "OPPORTUNITY",

  /* ======================================================
   * SERVICES
   * ====================================================== */

  SERVICE = "SERVICE",
  SERVICE_REQUEST = "SERVICE_REQUEST",
  SERVICE_JOB = "SERVICE_JOB",

  /* ======================================================
   * PLATFORM SERVICES
   * ====================================================== */

  NUMBER_SERIES = "NUMBER_SERIES",
  AUDIT = "AUDIT",
  WORKFLOW = "WORKFLOW",
  NOTIFICATION = "NOTIFICATION",
  STORAGE = "STORAGE",
  REPORTING = "REPORTING",
  DASHBOARD = "DASHBOARD",

  /* ======================================================
   * UTILITIES
   * ====================================================== */

  IMPORT = "IMPORT",
  EXPORT = "EXPORT",
  SETTINGS = "SETTINGS",
}
