import mongoose from "mongoose";
import { BUSINESS_TYPES, INDUSTRIES, OPERATING_MODES } from "@/data/businessConstants";
import { DEVICE_CATEGORIES } from "@/core/catalog/deviceCategory";
import { syncRecordToCentralApi, deleteRecordFromCentralApi } from "@/lib/centralApiSync";

/* =========================================================
   ACCESS
========================================================= */

const AccessSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
    },

    label: {
      type: String,
      default: "",
      trim: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    _id: false,
  }
);

/* =========================================================
   MODULE
========================================================= */

const ModuleSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
    },

    label: {
      type: String,
      required: true,
      trim: true,
    },

    route: {
      type: String,
      default: "",
    },

    icon: {
      type: String,
      default: "",
    },

    parent: {
      type: String,
      default: "",
    },

    badge: {
      type: String,
      default: "",
    },

    sortOrder: {
      type: Number,
      default: 0,
    },

    enabled: {
      type: Boolean,
      default: true,
    },

    access: {
      type: [AccessSchema],
      default: [],
    },
  },
  {
    _id: false,
  }
);

/* =========================================================
   VENDOR DOCUMENT REQUIREMENTS
========================================================= */

// Per-business override of which vendor compliance documents (from the
// fixed catalog in core/vendorCompliance.ts) are mandatory at onboarding
// vs optional. Empty array (the default for every existing business) means
// "use the catalog's built-in defaults" -- see
// vendorCompliance.ts's getVendorDocRequirements(). A business only needs
// an entry here for a doc type it wants to override (e.g. mark FSSAI
// mandatory for itself, or make PAN optional), not the whole catalog.
const VendorDocRequirementSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    mandatory: { type: Boolean, default: false },
  },
  { _id: false }
);

// Per-vendor-type (VendorProfile.appliedAs) module access, admin-configurable
// (nothing hardcoded). An entry with an empty/missing moduleKeys array means
// "no restriction beyond the business-wide Business.modules[] deny-list" --
// backward compatible with vendors of any type when no entry exists at all.
// See core/access/vendorAccess.service.ts's getVendorAvailableModules.
const VendorTypeModulesSchema = new mongoose.Schema(
  {
    appliedAs: { type: String, enum: ["BRAND", "SC", "POS"], required: true },
    moduleKeys: { type: [String], default: [] },
  },
  { _id: false }
);

/* =========================================================
   NUMBERING
========================================================= */

const NumberingSchema = new mongoose.Schema(
  {
    prefix: {
      type: String,
      default: "NA",
    },

    format: {
      type: String,
      default: "PREFIX-DATE-SEQ-RANDOM",
    },

    dateFormat: {
      type: String,
      default: "YYMMDD",
    },

    padding: {
      type: Number,
      default: 6,
    },

    randomLength: {
      type: Number,
      default: 6,
    },

    scope: {
      type: String,
      enum: [
        "BUSINESS",
        "WAREHOUSE",
      ],
      default: "BUSINESS",
    },

    example: {
      type: String,
      default: "",
    },
  },
  {
    _id: false,
  }
);

/* =========================================================
   DOCUMENT
========================================================= */

const DocumentItemSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: true,
    },

    templateId: {
      type: String,
      default: "",
    },

    numbering: {
      type: NumberingSchema,
      default: {},
    },
  },
  {
    _id: false,
  }
);

/* =========================================================
   DOCUMENT ENGINE
========================================================= */

const DocumentSchema = new mongoose.Schema(
  {
    invoice: {
      type: DocumentItemSchema,
      default: {},
    },

    receipt: {
      type: DocumentItemSchema,
      default: {},
    },

    purchaseOrder: {
      type: DocumentItemSchema,
      default: {},
    },

    goodsReceipt: {
      type: DocumentItemSchema,
      default: {},
    },

    salesOrder: {
      type: DocumentItemSchema,
      default: {},
    },

    customerOrder: {
      type: DocumentItemSchema,
      default: {},
    },

    vendorProduct: {
      type: DocumentItemSchema,
      default: {},
    },

    product: {
      type: DocumentItemSchema,
      default: {},
    },

    productVariant: {
      type: DocumentItemSchema,
      default: {},
    },

    stockAdjustment: {
      type: DocumentItemSchema,
      default: {},
    },

    stockTransfer: {
      type: DocumentItemSchema,
      default: {},
    },

    productionOrder: {
      type: DocumentItemSchema,
      default: {},
    },

    batch: {
      type: DocumentItemSchema,
      default: {},
    },

    creditNote: {
      type: DocumentItemSchema,
      default: {},
    },

    debitNote: {
      type: DocumentItemSchema,
      default: {},
    },
  },
  {
    _id: false,
  }
);

/* =========================================================
   COMPLIANCE
========================================================= */

const ComplianceSchema = new mongoose.Schema(
  {
    gstNumber: String,
    pan: String,
    cin: String,
    msme: String,
    iec: String,
    fssai: String,
    drugLicense: String,
  },
  {
    _id: false,
  }
);

/* =========================================================
   FINANCIAL
========================================================= */

const FinancialSchema = new mongoose.Schema(
  {
    // Legacy display-only field, kept as-is for existing reads. `homeCurrency`
    // below is now the canonical field going forward -- both are kept in
    // sync at the API layer so nothing that already reads `currency` breaks.
    currency: {
      type: String,
      default: "INR",
    },

    // Multi-currency scaffolding (see models/Currency.ts, ExchangeRate.ts).
    // Not consumed by any transactional flow yet -- build is India/INR-only
    // for now, per explicit direction. Every transactional document is
    // expected to default `currency: homeCurrency, fxRate: 1` until a
    // business actually enables additional currencies below.
    homeCurrency: {
      type: String,
      default: "INR",
      uppercase: true,
      trim: true,
    },

    // Which currencies this business may transact/bill in, beyond its own
    // home currency. Empty (the default) means home-currency-only -- single
    // currency businesses never need to touch this.
    allowedTransactionCurrencies: {
      type: [String],
      default: [],
    },

    fxRateSource: {
      type: String,
      enum: ["MANUAL", "AUTO"],
      default: "MANUAL",
    },

    fiscalYearStart: {
      type: String,
      default: "04-01",
    },

    taxStandard: {
      type: String,
      default: "GST",
    },

    decimalPlaces: {
      type: Number,
      default: 2,
    },

    priceIncludesTax: {
      type: Boolean,
      default: false,
    },
  },
  {
    _id: false,
  }
);

/* =========================================================
   AI
========================================================= */

const AISettingsSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: true,
    },

    autoGenerateSEO: {
      type: Boolean,
      default: true,
    },

    autoGenerateDescription: {
      type: Boolean,
      default: true,
    },

    autoGenerateTags: {
      type: Boolean,
      default: true,
    },
  },
  {
    _id: false,
  }
);

/* =========================================================
   MARKETPLACE
========================================================= */

const MarketplaceSchema = new mongoose.Schema(
  {
    enableB2B: {
      type: Boolean,
      default: true,
    },

    enableB2C: {
      type: Boolean,
      default: true,
    },

    enableVendorPortal: {
      type: Boolean,
      default: true,
    },

    enableManufacturing: {
      type: Boolean,
      default: true,
    },

    enableWarehouse: {
      type: Boolean,
      default: true,
    },

    // Readiness flag for a future customer-facing web ordering portal where
    // a vendor's registered Distributor/Retailer credit accounts (see
    // models/CreditAccount.ts) log in and place bulk orders at their own
    // channel pricing (core/pricing/pricingEngine.ts's distributor/retailer
    // tiers + MOQ slabs). The pricing engine and credit-account backend are
    // built and usable today; the ordering UI itself (login, catalog, cart,
    // checkout for these accounts) is NOT built yet. Off by default —
    // switch on only once that portal exists and this business is ready to
    // use it, not before.
    enableB2BPartnerOrdering: {
      type: Boolean,
      default: false,
    },

    // When on, a vendor application submitted at POST /api/vendors/apply
    // for this business skips the normal admin-review-then-agreement flow
    // entirely -- see services/vendorActivation.service.ts's
    // activateVendorWithTrial, called inline from apply/route.ts. The
    // agreement is emailed for signature, the portal login is created, and
    // a 7-day TRIAL Subscription starts immediately, all at submit time.
    // Off by default -- existing businesses keep the manual approval flow
    // unless an admin explicitly opts in.
    skipVendorApproval: {
      type: Boolean,
      default: false,
    },
  },
  {
    _id: false,
  }
);

/* =========================================================
   INVOICING RULES — how a marketplace order gets invoiced when it's
   fulfilled by a vendor. Per explicit user requirement: when a customer
   places an order, generate a B2B invoice (vendor -> this business, at the
   vendor's cost/wholesale basis) and a separate B2C invoice (this business
   -> the customer, at the sale price) rather than only settling the
   vendor's payout. Off by default (dualInvoiceMode: false) so existing
   commission-only settlement behavior (core/payouts/vendorSettlement.service.ts)
   is unchanged unless a business explicitly opts in.

   vendorCostBasis controls how the B2B leg's amount is computed — kept as
   an enum (not hardcoded logic) specifically so more bases can be added
   later without another migration:
     NET_PAYOUT           - vendor's cost = grossAmount minus platform
                            commission (same math vendorSettlement.service.ts
                            already uses for payouts)
     GROSS_AMOUNT         - vendor's cost = full line-item sale value, no
                            commission deducted (platform's margin comes
                            from elsewhere, e.g. a separate fee)
     FIXED_MARGIN_PERCENT - vendor's cost = sale value reduced by a flat
                            markup percent (fixedMarginPercent)
     VENDOR_DECLARED      - vendor's cost = the price the vendor declared
                            for that product (falls back to GROSS_AMOUNT if
                            no declared cost exists on the line item)
========================================================= */

const InvoicingRulesSchema = new mongoose.Schema(
  {
    dualInvoiceMode: {
      type: Boolean,
      default: false,
    },
    vendorCostBasis: {
      type: String,
      enum: ["NET_PAYOUT", "GROSS_AMOUNT", "FIXED_MARGIN_PERCENT", "VENDOR_DECLARED"],
      default: "NET_PAYOUT",
    },
    fixedMarginPercent: {
      type: Number,
      default: 0,
    },
    defaultSupplyType: {
      type: String,
      enum: ["INTRASTATE", "INTERSTATE"],
      default: "INTRASTATE",
    },
  },
  {
    _id: false,
  }
);

/* =========================================================
   BUSINESS
========================================================= */

const BusinessSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    legalName: {
      type: String,
      default: "",
      trim: true,
    },

    brandName: {
      type: String,
      default: "",
      trim: true,
    },

    businessCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    /**
     * A short, easy-to-say 2-character code (e.g. "AB") for quickly mapping
     * anything to this business — distinct from businessCode (used in
     * document numbering, often longer). Super-admin editable from the
     * business edit page; used to shorten public links like the customer
     * appointment-request page (?code=AB instead of a full ObjectId).
     * Sparse+unique so it's optional but never duplicated once set.
     */
    brandShortcut: {
      type: String,
      uppercase: true,
      trim: true,
      minlength: 2,
      maxlength: 2,
      unique: true,
      sparse: true,
    },

    tenantKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    // Constrained to INDUSTRIES (src/data/businessConstants.ts) rather than
    // free text — previously any string was accepted here, which meant the
    // same industry could be entered a dozen different ways across
    // businesses (e.g. "IT", "It Services", "software") with no way to
    // filter/report on it reliably.
    industry: {
      type: String,
      enum: [...INDUSTRIES, ""],
      default: "",
    },

    // Constrained to BUSINESS_TYPES (src/data/businessConstants.ts) — same
    // reasoning as `industry` above. Named `type` (not `businessType`) to
    // match the existing field name already used by forms/APIs; the
    // shared constant is still called BUSINESS_TYPES for clarity at the
    // call site.
    type: {
      type: String,
      enum: [...BUSINESS_TYPES, ""],
      default: "",
    },

    // Which of the three CRM operating surfaces this business runs as --
    // BRAND (multi-role, call center + appointments), SC (single-login
    // work-order flow), POS (transactional storefront billing). Drives
    // nav/module visibility and default landing flow. Distinct from `type`
    // above (legal structure). Empty string default (rather than a forced
    // enum default) so existing businesses aren't silently reclassified --
    // an admin must explicitly set this per business.
    operatingMode: {
      type: String,
      enum: [...OPERATING_MODES, ""],
      default: "",
      index: true,
    },

    // Set only when this business was created as an SC "add another SC
    // account" sub-account (see api/businesses/[id]/sub-accounts/route.ts)
    // -- the parent SC business whose Owner login spun this one up, paying
    // a separate subscription addon charge for it. Unset for every other
    // business, including SC businesses created the normal (admin) way.
    parentBusinessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      default: null,
      index: true,
    },

    email: {
      type: String,
      default: "",
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      default: "",
      trim: true,
    },

    website: {
      type: String,
      default: "",
      trim: true,
    },

    logo: {
      type: String,
      default: "",
    },

    favicon: {
      type: String,
      default: "",
    },

    address: {
      type: String,
      default: "",
    },

    city: {
      type: String,
      default: "",
    },

    state: {
      type: String,
      default: "",
    },

    // e-Invoice (INV-01) readiness: the official e-invoice schema requires
    // the supplier's 2-digit GST state code (e.g. "27" for Maharashtra),
    // which is a distinct enumerated value from the free-text `state` name
    // above — added additively here, same pattern as SalesInvoice.ts's own
    // e-invoice-readiness fields, so this business's data is ready to map
    // into an IRN request once an actual IRP integration is built. See
    // PROGRESS.md's GST section for the decision to target only the
    // official government e-invoice path and hold off on wiring a live
    // integration for now.
    gstStateCode: {
      type: String,
      default: "",
    },

    country: {
      type: String,
      default: "India",
    },

    // Whether this business tracks individual serial numbers in
    // inventory. When false (default), workorder part selection only
    // pulls from the Service Center BOM (no live stock check). When true,
    // part selection must check real Inventory stock before allowing a
    // part to be added, and deduct on job close -- see the workorder
    // repair flow. Configurable at Settings > (business settings), per
    // explicit direction ("give a button in settings that Whether
    // Inventory is serialized or not").
    inventorySerialized: {
      type: Boolean,
      default: false,
    },

    // Whether newly created BOM/Material entries (BOM -- see
    // that model's header comment; it's the canonical Material/BOM list
    // shared by SC, Brand and POS) get a server-generated code or a
    // manually typed one. AUTO (default) preserves existing behaviour
    // (PART-0001 style running sequence via the numbering engine).
    bomCodeGenerationMode: {
      type: String,
      enum: ["AUTO", "MANUAL"],
      default: "AUTO",
    },

    // Whether GST/tax gets applied on a plain B2C bill (a job sheet whose
    // customer has no company name -- see the isB2B branch in
    // api/crm/jobsheets/[id]/close/route.ts). Default true (existing
    // behaviour: B2C bills still carry whatever taxRate each line item
    // has). When turned off, B2C billing zeroes out tax on every line and
    // always lands on the NON_GST_INVOICE ("BILL") number series --
    // B2B invoices (company name present) are never affected by this
    // toggle, per explicit direction ("if it is on Business name then
    // B2B invoice must be generated").
    applyTaxOnB2CBilling: {
      type: Boolean,
      default: true,
    },

    // Telegram chat/group ID this business wants automated reports and
    // alerts delivered to -- paired with our own single Telegram bot (see
    // ANOPS_TELEGRAM_BOT_TOKEN / lib/telegram.ts). A user gets their own
    // chat id by messaging the bot /tgid (see api/telegram/webhook).
    telegramChatId: {
      type: String,
      trim: true,
      default: "",
    },

    // Automatic whole-business Telegram report (numbers + a chart image),
    // separate from the per-ReportDefinition Telegram option -- gated by
    // the "telegram-reports" plan feature (see core/pricing/planAccess.ts)
    // and driven by api/cron/telegram-business-report.
    telegramReportFrequency: {
      type: String,
      enum: ["NONE", "DAILY", "WEEKLY", "MONTHLY"],
      default: "NONE",
    },
    telegramReportLastSentAt: {
      type: Date,
    },

    // One-time linking code shown in Settings > Operations -- the admin
    // adds the bot to their chat/group and sends "/link <code>" instead of
    // manually copy-pasting a raw chat id into telegramChatId above (see
    // api/telegram/webhook's /link handler). Short-lived; cleared once
    // consumed or expired.
    telegramLinkCode: {
      type: String,
      trim: true,
      uppercase: true,
    },
    telegramLinkCodeExpiresAt: {
      type: Date,
    },

    // A vendor's OWN chat, separate from telegramChatId above (which is
    // this app's shared ops-facing group/business chat) -- a vendor Owner
    // links their personal Telegram DM the same /link <code> way, so
    // per-type alerts (see telegramMessageRouting) can go to their group,
    // their DM, or both. Optional -- most vendors will only ever set
    // telegramChatId (their team group).
    telegramPersonalChatId: {
      type: String,
      trim: true,
      default: "",
    },

    // Per-message-type routing: which of this vendor's two chats (group /
    // personal, both keyed above) each category of automated alert goes
    // to. Keyed by VENDOR_TELEGRAM_MESSAGE_TYPES[].key (see
    // core/telegram/vendorMessageTypes.ts) -- {} for a type means "not
    // configured yet", which sendVendorTelegramMessage() treats as
    // "group only" if telegramChatId is set, matching the single-channel
    // behavior every vendor already had before this was added.
    telegramMessageRouting: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Default rate for the workorder detail page's one-click "Add Labour
    // Charge" line, set by the vendor's Owner/Manager (Settings > Business
    // Settings) -- used whenever the vendor has no LABOUR-type
    // BOM entry of its own to pull a rate from instead.
    defaultLabourCharge: {
      type: Number,
      default: 0,
    },

    // UPI VPA (Virtual Payment Address, e.g. "business@okhdfcbank") used
    // to generate a scannable payment QR code on printed invoices -- see
    // core/payments/upiQr.ts. Blank (the default) means no QR prints;
    // never a hardcoded/shared VPA, always this business's own.
    upiId: {
      type: String,
      default: "",
      trim: true,
    },

    // Shown on the printed Intake Receipt/Workorder in place of the
    // device brand's own logo -- per explicit direction, that document
    // should never show the device manufacturer's branding or name.
    // Blank (the default) means no logo prints at all, not a fallback to
    // Business.logo or the device brand's logo.
    customerLogoUrl: {
      type: String,
      default: "",
    },

    // Signature image shown on printed Invoice/Workorder/Service Record
    // documents in the "Service Centre Signatory" slot. Blank (the
    // default) means no signature image prints -- the document instead
    // shows a "digital document, no physical signature required" notice.
    documentSignatureUrl: {
      type: String,
      default: "",
    },

    // Bank account details shown on printed invoices alongside (or
    // instead of) the UPI QR above -- display-only, same "workaround, no
    // gateway" reasoning as upiId: the customer transfers manually and
    // reconciliation stays manual until a real banking integration exists.
    bankAccountName: { type: String, default: "", trim: true },
    bankAccountNumber: { type: String, default: "", trim: true },
    bankIFSC: { type: String, default: "", trim: true },
    bankName: { type: String, default: "", trim: true },

    // Vendor-wide Terms & Conditions text, editable from the vendor
    // Owner/Manager's own profile/settings page -- kept as the fallback
    // shown on any document type below that has no terms of its own set
    // yet, so an existing business's single terms field keeps working.
    termsAndConditions: {
      type: String,
      default: "",
    },

    // Per-document-type Terms & Conditions -- per explicit direction
    // ("allow user to setup terms and conditions as per their own which
    // will come on workorder one set and another option for service
    // order and another for estimate and another for Invoice"). Each
    // falls back to termsAndConditions above when blank -- see
    // core/documentTemplates/adapters.ts's termsForDocType().
    workorderTerms: { type: String, default: "" },
    serviceOrderTerms: { type: String, default: "" },
    estimateTerms: { type: String, default: "" },
    invoiceTerms: { type: String, default: "" },

    // Narrows the workorder intake form's "Device Type" dropdown down to
    // just the categories this business actually services, instead of the
    // full 45-category universal list -- per explicit direction. Empty
    // (the default) means show every category, so existing businesses
    // aren't suddenly left with an empty dropdown until they configure this.
    enabledDeviceCategories: [{ type: String, enum: DEVICE_CATEGORIES }],

    // Free-text Brand/Model names this business has typed in on a workorder
    // intake before -- lets the "add new" mini-modal on that screen persist
    // a name so it shows up as a dropdown suggestion next time, without
    // requiring the shared, approval-gated Brand/Series/DeviceModel catalog
    // tree (see the SC intake screen's own comment on why that tree was
    // dropped in favour of plain text for this operating mode).
    savedBrands: [{ type: String, trim: true }],
    savedModels: [{ type: String, trim: true }],
    // Same save-and-suggest pattern, for the "Payment Collected By" name
    // typed in at handover -- who physically took the cash, not just
    // which of the single SC login is running the register.
    savedPaymentCollectors: [{ type: String, trim: true }],

    pincode: {
      type: String,
      default: "",
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Marks the single, real, always-present "AN Group" business record --
    // the platform owner itself, used wherever code previously meant "no
    // specific business" via a null/sentinel businessId. Having a real
    // Business document for this (instead of null) means AN Group behaves
    // exactly like any other business everywhere a business is expected --
    // it shows up in business lists/switchers/dropdowns as itself, and
    // every business-scoped record (like Admin > Access's category layout)
    // can use a real businessId for it instead of a null special case.
    isPlatform: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Which ONE business the public, unauthenticated pages default to when
    // no specific business is named in the URL (e.g. the homepage's bare
    // "Book an Appointment" CTA at /appointment-request with no
    // ?businessId=/?code=). Defaults to whichever Business has this flag
    // set (should only ever be one -- toggling it on for a new business is
    // the admin's responsibility to also turn off on the previous one);
    // falls back to the AN Group platform business (isPlatform: true) if
    // none is set. Lets an admin point public appointment/service links at
    // their actual customer-facing service business (e.g. a distinct
    // "Service Flow" business) instead of AN Group's own platform record,
    // without any code change.
    isDefaultPublicBusiness: {
      type: Boolean,
      default: false,
      index: true,
    },

    aiEnabled: {
      type: Boolean,
      default: true,
    },

    modules: {
      type: [ModuleSchema],
      default: [],
    },

    vendorDocumentRequirements: {
      type: [VendorDocRequirementSchema],
      default: [],
    },

    vendorTypeModules: {
      type: [VendorTypeModulesSchema],
      default: [],
    },

    documents: {
      type: DocumentSchema,
      default: {},
    },

    compliance: {
      type: ComplianceSchema,
      default: {},
    },

    financial: {
      type: FinancialSchema,
      default: {},
    },

    marketplace: {
      type: MarketplaceSchema,
      default: {},
    },

    invoicingRules: {
      type: InvoicingRulesSchema,
      default: {},
    },

    ai: {
      type: AISettingsSchema,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

/* =========================================================
   INDEXES
========================================================= */

// businessCode, tenantKey, and isActive each already get an index from
// their own field-level `index: true` (businessCode/tenantKey also have
// `unique: true`, which implies an index on its own) -- these were
// duplicate .index() calls producing Mongoose's "Duplicate schema index"
// warning on every boot for all three fields.
BusinessSchema.index({
  email: 1,
});

/* =========================================================
   CENTRAL-API SYNC (Phase A — dual write, see src/lib/centralApiSync.ts)
   Best-effort — a central-api outage never fails the local save/delete
   that triggered it (syncRecordToCentralApi/deleteRecordFromCentralApi
   swallow their own errors). Covers save() (create + doc.save()) and
   findOneAndUpdate() calls that pass {new: true} — an update call that
   doesn't request the updated doc back isn't synced by this hook; that's
   an acceptable gap for a dual-write phase whose only job is to get
   central-api populated, not to be authoritative yet.

   These hooks ARE awaited (async function + await, not fire-and-forget):
   a Vercel serverless function can be frozen the instant its response is
   sent, which would silently kill an un-awaited sync mid-flight before it
   ever reaches central-api. Mongoose waits for a post hook's returned
   promise before resolving the save()/findOneAndUpdate() call, so
   awaiting here makes the sync attempt (success OR the caught failure)
   complete before the request handler can finish and the function can
   freeze.
========================================================= */

/**
 * An AN-CRM "Business" (a tenant company running BRAND/POS/SC) is NOT a
 * top-level business in the AN Group hierarchy -- it's a VENDOR of the
 * "Service Flow" business, the same relationship a shopnative.in seller
 * has to "E-Commerce". This used to sync into central-api's "businesses"
 * dataset (as if each tenant were its own top-level business, which was
 * wrong -- see the AN Group / Service Flow / E-Commerce three-tier
 * discussion this replaced); now it syncs into "vendors" instead, tagged
 * with the parent business id and its operatingMode as the vendor type.
 *
 * CENTRAL_API_SERVICE_FLOW_BUSINESS_ID is central-api's own _id for the
 * "Service Flow" row under "businesses" (created once via the admin
 * dashboard, NOT this app's own id for anything) -- sync is skipped
 * entirely until this is set, same "not configured yet" convention as
 * CENTRAL_API_URL itself, rather than writing rows with a missing/null
 * parent that would need manual cleanup later.
 */
function centralApiVendorPayload(doc: any) {
  return {
    ...doc,
    businessId: process.env.CENTRAL_API_SERVICE_FLOW_BUSINESS_ID,
    parentId: null,
    vendorType: doc.operatingMode || null,
    source: "an-crm",
  };
}

// Separate, independent sync into central-api's own top-level "businesses"
// dataset -- NOT the "vendors" sync above (that's a different, unrelated
// hierarchy concept: this app's tenants viewed as vendors of a "Service
// Flow" parent business). This one is what every later per-business
// cross-app feature (shared integration overrides, report-field-config,
// vendor-onboarding-config, role-catalog) actually reads via
// resolveCentralBusinessId()'s sourceId search -- that lookup had nothing
// populating it until now, so all of those per-business overrides were
// silently non-functional for AN-CRM specifically. Gated only on
// CENTRAL_API_URL/KEY being configured (unlike the vendors sync above,
// this has no dependency on the Service Flow hierarchy).
function centralApiBusinessPayload(doc: any) {
  return {
    name: doc.name,
    brandName: doc.brandName,
    operatingMode: doc.operatingMode,
    isActive: doc.isActive,
    isPlatform: doc.isPlatform,
    app: "an-crm",
  };
}

BusinessSchema.post("save", async function (doc) {
  const plain = doc.toObject();
  await syncRecordToCentralApi("businesses", doc._id.toString(), centralApiBusinessPayload(plain));
  if (!process.env.CENTRAL_API_SERVICE_FLOW_BUSINESS_ID) return;
  await syncRecordToCentralApi("vendors", doc._id.toString(), centralApiVendorPayload(plain));
});

BusinessSchema.post("findOneAndUpdate", async function (doc) {
  // doc is a plain object (no .toObject()) when the query used .lean() --
  // e.g. api/businesses/[id]/route.ts's PATCH handler -- vs. a real
  // Document otherwise. Both are already plain-object-safe for
  // syncRecordToCentralApi, so just skip the conversion when it's not
  // there instead of crashing every lean update ("a.toObject is not a
  // function", which was silently breaking every Settings save).
  if (!doc) return;
  const plain = doc.toObject ? doc.toObject() : doc;
  await syncRecordToCentralApi("businesses", doc._id.toString(), centralApiBusinessPayload(plain));
  if (!process.env.CENTRAL_API_SERVICE_FLOW_BUSINESS_ID) return;
  await syncRecordToCentralApi("vendors", doc._id.toString(), centralApiVendorPayload(plain));
});

BusinessSchema.post("findOneAndDelete", async function (doc) {
  if (!doc) return;
  await deleteRecordFromCentralApi("businesses", doc._id.toString());
  if (!process.env.CENTRAL_API_SERVICE_FLOW_BUSINESS_ID) return;
  await deleteRecordFromCentralApi("vendors", doc._id.toString());
});

/* =========================================================
   EXPORT
========================================================= */

export default
  mongoose.models.Business ||
  mongoose.model(
    "Business",
    BusinessSchema
  );
