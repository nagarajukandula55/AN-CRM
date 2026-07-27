/**
 * Single source of truth for BusinessMemberType — plain data (no mongoose),
 * safe to import from both server code (models/BusinessMember.ts) and
 * client components (e.g. vendor/staff/page.tsx's role dropdown).
 *
 * Previously vendor/staff/page.tsx hand-typed its own duplicate list of
 * member types for its role dropdown, which could silently drift from the
 * real enum in models/BusinessMember.ts (the owner's "Role should be in
 * enum" complaint). This file is now the one place both sides read from.
 */
export const BUSINESS_MEMBER_TYPES = [
  "OWNER", "ADMIN", "MANAGER", "STAFF", "EMPLOYEE",
  "VENDOR", "VENDOR_WAREHOUSE", "VENDOR_HELPER",
  "VENDOR_PACKER", "VENDOR_DELIVERY", "VENDOR_LOGISTICS",
  "CUSTOMER",
  "CCO", "ENGINEER", "CENTRE_MANAGER",
  "HELPER", "PACKER", "SCM",
] as const;

export type BusinessMemberTypeValue = (typeof BUSINESS_MEMBER_TYPES)[number];

/** Labels for the general vendor-staff-relevant member types (used in the
 * vendor staff dropdown's base list — excludes business-level types like
 * OWNER/ADMIN/CUSTOMER that don't apply to vendor staff). */
export const VENDOR_STAFF_MEMBER_TYPES: { value: BusinessMemberTypeValue; label: string }[] = [
  { value: "VENDOR_WAREHOUSE", label: "Warehouse Staff" },
  { value: "VENDOR_HELPER", label: "General Helper" },
  { value: "VENDOR_PACKER", label: "Packer" },
  { value: "VENDOR_DELIVERY", label: "Delivery" },
  { value: "VENDOR_LOGISTICS", label: "Logistics" },
];

/** Store Front / Service Center staff roles — only relevant when the vendor
 * has enableStoreFront or enableServiceCenter set. */
export const STORE_FRONT_MEMBER_TYPES: { value: BusinessMemberTypeValue; label: string }[] = [
  { value: "CCO", label: "CCO" },
  { value: "ENGINEER", label: "Engineer" },
  { value: "CENTRE_MANAGER", label: "Centre Manager" },
];

/** Warehouse staff roles — only relevant when the vendor has
 * enableWarehouse set. */
export const WAREHOUSE_MEMBER_TYPES: { value: BusinessMemberTypeValue; label: string }[] = [
  { value: "HELPER", label: "Helper" },
  { value: "PACKER", label: "Packer" },
  { value: "SCM", label: "SCM" },
];
