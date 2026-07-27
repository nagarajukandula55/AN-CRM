import Business from "@/models/Business";
import { getStateCode } from "@/core/gst/stateCodes";
import { generateGlobalDocumentNumber } from "@/core/numbering/numberingService";

/* ================= DEFAULT MODULES ================= */
const DEFAULT_MODULES = [
  {
    key: "dashboard",
    label: "Dashboard",
    route: "/dashboard",
    enabled: true,
    permissions: ["DASHBOARD_VIEW"],
  },
  {
    key: "orders",
    label: "Orders",
    route: "/orders",
    enabled: true,
    permissions: ["ORDER_VIEW", "ORDER_MANAGE"],
  },
  {
    key: "invoices",
    label: "Invoices",
    route: "/invoices",
    enabled: true,
    permissions: ["INVOICE_VIEW", "INVOICE_CREATE"],
  },
  {
    key: "finance",
    label: "Finance",
    route: "/finance",
    enabled: true,
    permissions: ["FINANCE_VIEW"],
  },
  {
    key: "ai",
    label: "AI Workspace",
    route: "/ai",
    enabled: true,
    permissions: ["AI_ACCESS"],
  },
];

/* ================= BOOTSTRAP BUSINESS ================= */

// Business.tenantKey is required+unique in the schema but nothing here ever
// set it, so every Business.create() call below was throwing a Mongoose
// validation error ("tenantKey is required") and the whole "create business"
// flow was silently failing on the backend — this is why there was no way to
// actually create/see a business despite the form existing.
function slugify(input: string) {
  return (input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
}

export async function bootstrapBusiness(payload: any) {
  // Was `BUS-${Date.now()}` — the one entity code that never got migrated
  // to the canonical numbering engine during the original consolidation
  // sweep (see core/numbering/types.ts's BUSINESS entry comment), so it was
  // both collision-prone under concurrent creates and completely outside
  // admin control from the Document Numbers page. There's no businessId to
  // scope by yet at this point (the business doesn't exist until the
  // create() call below), so this uses the same global-counter pattern as
  // VENDOR numbering.
  const businessCode =
    payload.businessCode ||
    (await generateGlobalDocumentNumber("BUSINESS")).value;

  const tenantKeyBase =
    slugify(payload.name) || slugify(businessCode) || "business";
  const tenantKey = `${tenantKeyBase}-${Date.now().toString(36)}`;

  const business = await Business.create({
    name: payload.name,
    legalName: payload.legalName,
    brandName: payload.brandName,

    businessCode,
    tenantKey,

    industry: payload.industry,
    type: payload.type,

    email: payload.email,
    phone: payload.phone,
    website: payload.website,

    // These were being collected by nothing before (the create form never
    // even had inputs for them) and, separately, weren't being passed
    // through here even though Business.ts's schema has always supported
    // them — both gaps are fixed together now that the form has real
    // address/state/city/pincode inputs.
    address: payload.address,
    city: payload.city,
    state: payload.state,
    pincode: payload.pincode,
    gstStateCode: payload.gstStateCode || getStateCode(payload.state),

    isActive: true,

    modules: DEFAULT_MODULES,

    // Field names below match the Business model's DocumentSchema
    // (singular "invoice", "creditNote", "debitNote", "receipt" — not the
    // plural names previously used here, which Mongoose silently stripped
    // since they aren't declared paths on the schema).
    documents: {
      invoice: {
        enabled: true,
        numbering: {
          prefix: "NA",
          format: "PREFIX-DATE-SEQ-RANDOM",
          dateFormat: "YYMMDD",
          padding: 6,
        },
      },

      creditNote: { enabled: true },
      debitNote: { enabled: true },
      receipt: { enabled: true },
    },

    // ComplianceSchema stores these as flat fields (gstNumber, pan, cin,
    // msme, iec, ...) — not a nested `gst: { number, registered }` object,
    // which is also silently stripped by Mongoose's default strict mode.
    compliance: {
      gstNumber: payload.gstNumber,
      pan: payload.pan,
      cin: payload.cin,
      msme: payload.msme,
      iec: payload.iec,
    },

    financial: {
      currency: "INR",
      fiscalYearStart: "04-01",
      taxStandard: "GST",
      decimalPlaces: 2,
      priceIncludesTax: false,
    },
  });

  return business;
}
