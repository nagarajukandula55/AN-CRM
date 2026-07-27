/**
 * =========================================================
 * AN GROUP ERP PLATFORM
 * Number Series Engine Constants
 * ---------------------------------------------------------
 * Centralized constants used by the Number Series Engine.
 *
 * These constants are shared across:
 * - Models
 * - Services
 * - APIs
 * - UI
 * - Validation
 * - Workflow
 * - Audit
 *
 * IMPORTANT
 * Never hardcode these values anywhere else.
 * =========================================================
 */

/* =========================================================
 * RESET POLICY
 * ========================================================= */

export enum NumberSeriesResetPolicy {
  NEVER = "NEVER",
  DAILY = "DAILY",
  MONTHLY = "MONTHLY",
  YEARLY = "YEARLY",
  FINANCIAL_YEAR = "FINANCIAL_YEAR",
  CUSTOM = "CUSTOM",
}

/* =========================================================
 * SERIES SCOPE
 * ========================================================= */

export enum NumberSeriesScope {
  GLOBAL = "GLOBAL",
  ORGANIZATION = "ORGANIZATION",
  BUSINESS = "BUSINESS",
  WAREHOUSE = "WAREHOUSE",
}

/* =========================================================
 * STATUS
 * ========================================================= */

export enum NumberSeriesStatus {
  ACTIVE = "ACTIVE",
  DISABLED = "DISABLED",
}

/* =========================================================
 * SEPARATORS
 * ========================================================= */

export enum NumberSeriesSeparator {
  NONE = "",
  DASH = "-",
  SLASH = "/",
  UNDERSCORE = "_",
  DOT = ".",
  SPACE = " ",
}

/* =========================================================
 * VARIABLES
 * ========================================================= */

export enum NumberSeriesVariable {
  ORGANIZATION = "{ORG}",
  BUSINESS = "{BUSINESS}",
  WAREHOUSE = "{WAREHOUSE}",

  YEAR = "{YEAR}",
  SHORT_YEAR = "{YY}",

  MONTH = "{MONTH}",
  DAY = "{DAY}",

  FINANCIAL_YEAR = "{FY}",

  SEQUENCE = "{SEQ}",
}

/* =========================================================
 * VERSION STATUS
 * ========================================================= */

export enum NumberSeriesVersionStatus {
  DRAFT = "DRAFT",
  PUBLISHED = "PUBLISHED",
  ARCHIVED = "ARCHIVED",
}

/* =========================================================
 * ENGINE LIMITS
 * ========================================================= */

export const NUMBER_SERIES_LIMITS = {
  PREFIX_MAX_LENGTH: 100,
  SUFFIX_MAX_LENGTH: 100,

  NAME_MAX_LENGTH: 150,
  CODE_MAX_LENGTH: 100,
  DESCRIPTION_MAX_LENGTH: 1000,

  MIN_PADDING: 1,
  MAX_PADDING: 20,

  MIN_INCREMENT: 1,
  MAX_INCREMENT: 100000,

  MIN_START_NUMBER: 1,
  MAX_START_NUMBER: 999999999999,

  MAX_SEQUENCE_VALUE: 999999999999,
} as const;

/* =========================================================
 * DEFAULT VALUES
 * ========================================================= */

export const DEFAULT_NUMBER_SERIES = {
  PREFIX: "",

  SUFFIX: "",

  SEPARATOR: NumberSeriesSeparator.DASH,

  PADDING: 5,

  START_NUMBER: 1,

  CURRENT_NUMBER: 0,

  INCREMENT: 1,

  RESET_POLICY: NumberSeriesResetPolicy.NEVER,

  STATUS: NumberSeriesStatus.ACTIVE,

  VERSION: 1,

  ENABLED: true,
} as const;

/* =========================================================
 * RESERVED VARIABLES
 * ========================================================= */

export const RESERVED_NUMBER_SERIES_VARIABLES: readonly string[] = [
  NumberSeriesVariable.ORGANIZATION,
  NumberSeriesVariable.BUSINESS,
  NumberSeriesVariable.WAREHOUSE,
  NumberSeriesVariable.YEAR,
  NumberSeriesVariable.SHORT_YEAR,
  NumberSeriesVariable.MONTH,
  NumberSeriesVariable.DAY,
  NumberSeriesVariable.FINANCIAL_YEAR,
  NumberSeriesVariable.SEQUENCE,
] as const;

/* =========================================================
 * PREVIEW
 * ========================================================= */

export const NUMBER_SERIES_PREVIEW_SEQUENCE = 123;

/* =========================================================
 * DATE FORMATS
 * ========================================================= */

export const NUMBER_SERIES_DATE_FORMAT = {
  YEAR: "YYYY",
  SHORT_YEAR: "YY",
  MONTH: "MM",
  DAY: "DD",
  FINANCIAL_YEAR: "FY",
} as const;
