import mongoose, { Schema, Document, Model } from 'mongoose';
import { DEVICE_CATEGORIES, type DeviceCategory } from '@/core/catalog/deviceCategory';
import { syncRecordToCentralApi, deleteRecordFromCentralApi } from '@/lib/centralApiSync';

/**
 * Vendor onboarding lifecycle:
 *  APPLIED          — vendor submitted the public application form
 *  PENDING          — created directly by admin (legacy default)
 *  AGREEMENT_DRAFTED — admin reviewed & approved application; a partner
 *                      Agreement document was generated, but NOT yet sent
 *                      to the vendor for signing. Distinct from
 *                      AGREEMENT_SENT below — previously this codebase set
 *                      vendor.status = AGREEMENT_SENT at the moment the
 *                      Agreement doc was merely CREATED (in
 *                      review/route.ts), which meant the admin UI would
 *                      claim an agreement was "sent" even if nobody had
 *                      clicked Send yet. This status is the real interim
 *                      state between approval and an actual send action.
 *  AGREEMENT_SENT   — the signing invitation (OTP link) was actually
 *                     dispatched, via POST /api/agreements/[id]/send —
 *                     THIS is what sets AGREEMENT_SENT now, not approval.
 *  AGREEMENT_SIGNED — vendor signed the agreement (verified via Agreement)
 *  AGREEMENT_CANCELLED — the agreement tied to this vendor (via
 *                      agreementId) was cancelled from the Agreements page
 *                      (DELETE /api/agreements/[id]) before it reached
 *                      FULLY_SIGNED. Previously cancelling an agreement
 *                      only updated the Agreement document itself — the
 *                      vendor's own status kept reading AGREEMENT_SENT
 *                      forever, and VendorDetailModal had no action button
 *                      for any post-AGREEMENT_DRAFTED state, so the vendor
 *                      was stuck with no way to re-send or restart review.
 *                      This status makes the cancellation visible on the
 *                      vendor record itself and is the trigger for
 *                      VendorDetailModal to show a "Restart Review" /
 *                      "Re-send Agreement" action.
 *  APPROVED         — admin gave final approval; vendor ID + login issued
 *  ACTIVE           — vendor is live (can manage warehouse/products/orders)
 *  INACTIVE / REJECTED / SUSPENDED — terminal / paused states
 */
export type VendorStatus =
  | 'APPLIED'
  | 'PENDING'
  | 'AGREEMENT_DRAFTED'
  | 'AGREEMENT_SENT'
  | 'AGREEMENT_SIGNED'
  | 'AGREEMENT_CANCELLED'
  | 'APPROVED'
  | 'ACTIVE'
  | 'INACTIVE'
  | 'REJECTED'
  | 'SUSPENDED';

export interface IVendorProfile extends Document {
  userId?:      mongoose.Types.ObjectId;
  /**
   * Optional at the APPLIED stage — a vendor raising a general signup
   * request (via /vendor-apply's business-agnostic flow) doesn't know or
   * choose which business they're being onboarded under; the admin picks
   * that at approval time (see /api/vendors/[id]/review, which now
   * accepts a businessId in its APPROVE body and sets it there). Always
   * required again by the time a vendor reaches AGREEMENT_SENT or later —
   * every other vendor-facing route (VendorProfile lookups, businessId
   * scoping in /api/vendors, dashboards, orders) assumes it's set once a
   * vendor is actually operating.
   */
  businessId?:   mongoose.Types.ObjectId;
  /** Human-facing tracking number shown to the applicant immediately on
   * submission, independent of vendorId (which historically also serves
   * as the operational vendor ID once approved) — kept as a separate
   * field so an unassigned application still gets a stable reference
   * number the vendor can quote when following up, even before vendorId's
   * generator (which takes a businessId) can run for real.
   */
  requestNumber?: string;
  vendorId:     string;
  /**
   * Sub-vendor hierarchy: a vendor can create sub-vendors under itself, per
   * explicit direction ("For every vendor they can create sub vendors
   * under them ... AN group should consider them as vendors only and
   * number must be assigned accordingly"). A sub-vendor IS a full
   * VendorProfile in its own right -- same model, same global vendorId
   * numbering sequence (generateGlobalDocumentNumber("VENDOR", ...), see
   * api/auth/register/vendor/route.ts) -- distinguished only by this
   * optional self-reference to its parent. Unset (the default) means a
   * top-level/main vendor. Self-referencing rather than a separate
   * SubVendor model, same pattern as ProductCategory/FaultCode's parentId.
   */
  parentVendorId?: mongoose.Types.ObjectId;
  /**
   * Per-vendor Telegram linking -- moved here from Business (see
   * models/Business.ts's own telegram* fields, still present for legacy
   * reads but no longer the source of truth) once the platform changed to
   * a single shared Business with many VendorProfiles under it. Business-
   * level fields meant every vendor's /link overwrote the SAME document,
   * so only one vendor's chat could ever be linked platform-wide -- the
   * exact bug reported ("every vendor should have separate group... check
   * whether it is getting proper vendor list or business"). Unset on a
   * sub-vendor (parentVendorId set) falls back to its parent's chat at
   * send time (see core/telegram/resolveVendorChatConfig.ts) rather than
   * requiring every sub-vendor to link its own chat separately, unless it
   * explicitly links its own.
   */
  telegramChatId?: string;
  telegramPersonalChatId?: string;
  // Short-lived, single-use linking code -- see api/vendor/telegram-link-code
  // (generates it) and api/telegram/webhook (consumes it). Replaces asking
  // the vendor to type their own real Vendor ID into the bot: that id is
  // visible all over the app/URLs, not a secret, so anyone who knew or
  // guessed it could link THEIR OWN chat to receive (or worse, redirect)
  // another vendor's reports. A random code that expires and can only be
  // used once closes that gap and is also easier -- scan a QR/tap a deep
  // link instead of typing anything.
  telegramLinkCode?: string;
  telegramLinkCodeExpiresAt?: Date | null;
  // 7-day free-access window from self-signup (see api/vendors/self-signup
  // -- every new vendor auto-approves and gets this immediately, no admin
  // review). See lib/vendor/checkTrialAccess.ts for how this gates portal
  // access once it lapses, and api/vendor/billing/invoices/[invoiceId]/
  // confirm/route.ts for how a vendor's FIRST paid period is calculated
  // from THIS date (not the payment date) so trial time is absorbed into
  // the first billing cycle rather than stacking as extra free time.
  trialEndsAt?: Date | null;
  // ONE-TIME pre-launch goodwill window: a vendor who signed up before
  // EARLY_ACCESS_CUTOFF (see api/vendors/self-signup/route.ts) has both
  // their trial AND their first paid period counted from
  // EARLY_ACCESS_ANCHOR instead of their real signup date -- so testing
  // the app before the official go-live date doesn't burn any of their
  // real free days. Set ONLY at signup time from the server clock (never
  // client input), and only ever null for every signup after the cutoff
  // -- this is not a recurring mechanism, just this one launch window.
  earlyAccessAnchor?: Date | null;
  telegramReportFrequency?: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  telegramReportLastSentAt?: Date;
  // "HH:mm" (24h, IST -- the only timezone this app operates in), the
  // time-of-day api/cron/telegram-business-reports checks against instead
  // of just "N hours since last send". A bot can't ask Telegram itself to
  // deliver at a given time (only a human composing in the Telegram client
  // can schedule a send) -- this is this app's own approximation, accurate
  // to however often that cron route actually runs.
  telegramReportTime?: string;
  telegramMessageRouting?: Record<string, { group?: boolean; personal?: boolean }>;
  /**
   * Placeholder billing/charge fields for sub-vendor creation -- per
   * explicit direction ("for every sub vendor they add we need to charge
   * them so, either they have to allow them to have another vendor or
   * they can have sub vendor"). Not wired to any real payment/billing
   * flow yet -- arranged here so the data model doesn't need another
   * migration once pricing is decided; `subVendorPlan` gates whether this
   * vendor is currently allowed to create sub-vendors at all.
   */
  subVendorBilling?: {
    subVendorPlan?: "NONE" | "ALLOWED" | "BLOCKED";
    subVendorCount?: number;
    subVendorChargePerAdd?: number;
    subVendorChargeCurrency?: string;
    lastChargedAt?: Date;
  };
  companyName:  string;
  contactPerson?: string;
  email?:       string;
  phone?:       string;
  address?: {
    street?:  string;
    city?:    string;
    state?:   string;
    pincode?: string;
    country:  string;
  };
  // Referral/partner attribution -- captured from a "?ref=<code>" query
  // param at self-signup time (see api/vendors/self-signup/route.ts), so
  // a future referral program (dealers/consultants/IT providers/local
  // resellers -- see the partner-signup flow's own scope) has real
  // attribution data to work from instead of needing a data backfill.
  // Deliberately NOT a commission system -- just capture, per explicit
  // direction ("prepare the architecture for referral attribution").
  referredByCode?: string;
  /**
   * Printed on the Service Record generated after closing a job sheet
   * (see api/crm/jobsheets/[id]/service-record) -- kept editable here
   * (Owner/Manager only, enforced in api/vendor/profile's PUT) rather
   * than hardcoded into the print template, since every vendor's own
   * hours/hotline differ. Address/phone above are reused for the same
   * document rather than duplicating them here.
   */
  serviceCenterInfo?: {
    hours?:   string; // e.g. "10:00-13:00 14:00-19:00 (Week Off: Sunday)"
    hotline?: string;
  };
  /** true = GST-registered vendor (gstNumber required), false = without GST */
  gstRegistered?: boolean;
  gstNumber?:  string;
  panNumber?:  string;
  /** partner agreement generated at review-approval time */
  agreementId?: mongoose.Types.ObjectId;
  reviewedBy?:  mongoose.Types.ObjectId;
  reviewedAt?:  Date;
  finalApprovedBy?: mongoose.Types.ObjectId;
  finalApprovedAt?: Date;
  rejectionReason?: string;
  bankDetails?: {
    accountName?:  string;
    accountNumber?: string;
    ifscCode?:     string;
    bankName?:     string;
  };
  /**
   * Vendor-uploaded compliance/verification documents — previously
   * completely absent from this model (Vendor.js, the OTHER legacy vendor
   * model, has a `documents[]` array with a documentType enum incl.
   * CANCELLED_CHEQUE/GST, but that model isn't the one any live form/route
   * actually uses; VendorProfile is). Stored as Cloudinary URLs via the
   * existing /api/assets/upload pipeline (extended to accept PDFs).
   */
  documents?: {
    passbookUrl?:        string; // bank passbook / cancelled cheque, for account+IFSC confirmation
    passbookUploadedAt?: Date;
    gstCertificateUrl?:       string;
    gstCertificateUploadedAt?: Date;
    /**
     * Domain-specific compliance documents, keyed by a stable machine key
     * (e.g. "fssai_license" for food/FMCG vendors, "drug_license" for
     * pharma, etc.) — see core/vendorCompliance.ts for which keys are
     * required per business industry. Kept as an open map rather than one
     * hardcoded field per industry, since India has many industry-specific
     * licenses (FSSAI, Drug License, BIS certification, Pollution Control
     * clearance, ...) and hardcoding a field per one would mean a schema
     * change every time onboarding needs to cover a new industry.
     */
    compliance?: Record<string, { url?: string; uploadedAt?: Date; number?: string }>;
  };
  creditLimit: number;
  paymentTerms: string;
  marketplaceCommissionPercent: number;
  category?: string;
  businessType?: string;
  // Which operating mode this vendor is applying to run as -- Brand/SC/
  // POS -- captured at signup, per explicit direction ("in the signup
  // page add Type they are applying"). Informational for admin review at
  // approval time; the actual operating mode is set on the Business
  // record it gets attached to (see models/Business.ts's operatingMode),
  // not enforced from this field automatically.
  appliedAs?: "SC";
  /**
   * Which electronics device types (Mobile, Laptop, TV, ...) this vendor
   * actually services -- distinct from the single free-text `category`
   * above. Scopes which Fault Code / Symptom Code / Solution sections are
   * relevant to this vendor going forward, using the same taxonomy as
   * Brand.category and FaultCode/SymptomCode.deviceCategory.
   */
  productCategories?: DeviceCategory[];
  notes?:    string;
  termsAndConditions?: string;
  // Per-vendor operational settings -- previously these all lived on the
  // shared platform Business document, which every self-signed-up vendor
  // points its businessId at (see api/vendors/self-signup/route.ts).
  // Reading/writing them there meant one vendor's saved logo/UPI ID/T&C/
  // labour rate silently overwrote every OTHER vendor's, since they were
  // all reading and writing the exact same fields on the exact same
  // shared document -- reported live ("in operations tab for new vendor
  // also all terms and conditions, service charges, upi id, everything
  // coming what i set for my vendor"). Moved here so each vendor has
  // their own copy; see api/vendor/settings/route.ts.
  inventorySerialized?: boolean;
  defaultLabourCharge?: number;
  // Per-document-type T&C, same shape as Business's own workorderTerms/
  // serviceOrderTerms/estimateTerms/invoiceTerms (see
  // core/documentTemplates/adapters.ts's termsForDocType) -- termsAndConditions
  // above is the fallback when a specific one is blank. Was previously a
  // single unified field shown as one blanket "Terms & Conditions" on
  // every document type; reported live ("Should be separate per page
  // type not same for all").
  workorderTerms?: string;
  serviceOrderTerms?: string;
  estimateTerms?: string;
  invoiceTerms?: string;
  // Same isolation reasoning as the fields above -- these were also being
  // read/written on the shared platform Business (Business.savedBrands/
  // savedModelsByBrand/savedPaymentCollectors) via the "add new" mini-modal
  // on the workorder intake screen, so one vendor's saved brand/model/
  // payment-collector names leaked into and were writable by every other
  // vendor. Per-vendor dropdown-suggestion lists, not an approval-gated
  // shared catalog (see the intake screen's own comment on that distinction).
  savedBrands?: string[];
  savedModelsByBrand?: Record<string, string[]>;
  savedPaymentCollectors?: string[];
  customerLogoUrl?: string;
  // This vendor's own brand logo -- shown in their vendor-portal sidebar
  // and, per businessToCompany's own vendor-identity-override pattern,
  // preferred over the shared platform Business's logo on printed
  // documents. Distinct from customerLogoUrl above (that one substitutes
  // for the device BRAND's logo on an Intake Receipt/Workorder print, a
  // completely different purpose).
  logoUrl?: string;
  // A SEPARATE upload from logoUrl above, specifically for printed
  // documents -- a vendor's sidebar brand mark and what they want on a
  // customer-facing Workorder/Estimate/Invoice aren't always the same
  // image (e.g. a simpler, print-friendly mark vs a colorful app icon).
  // Falls back to logoUrl when unset, so a vendor who already enabled
  // documentLogoEnabled before this field existed keeps seeing their
  // existing logo on documents with no action needed.
  documentLogoUrl?: string;
  documentSignatureUrl?: string;
  // Whether documentLogoUrl (or logoUrl, if that's unset) prints on
  // Workorder/Estimate/Invoice/Service Record documents, and where --
  // default off (see api/vendor/settings route's own comment on why these
  // live per-vendor here, not Business).
  documentLogoEnabled?: boolean;
  documentLogoPosition?: "LEFT" | "CENTER" | "RIGHT";
  // "Digital document — no physical signature required" placeholder text
  // shown when documentSignatureUrl is blank -- default off.
  showDigitalDocumentNotice?: boolean;
  // Whether the workorder print shows who logged the intake (CCO name) --
  // default off.
  showCcoNameOnPrint?: boolean;
  applyTaxOnB2CBilling?: boolean;
  upiId?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  bankIFSC?: string;
  bankName?: string;
  rating:    number;
  status:    VendorStatus;
  isApproved: boolean;
  isDeleted:  boolean;
  /**
   * Independent operational-facility toggles set by an admin on a vendor's
   * profile — a vendor may run any combination of these. Drives which
   * staff memberType roles are relevant for this vendor (Store
   * Front/Service Center → CCO/ENGINEER/CENTRE_MANAGER; Warehouse →
   * HELPER/PACKER/SCM — see BusinessMember.ts).
   */
  enableStoreFront?:    boolean;
  enableB2BOrdering?:   boolean;
  enableServiceCenter?: boolean;
  enableWarehouse?:     boolean;
  /**
   * Facility/location IDs, generated exactly once via the canonical
   * numbering engine (generateDocumentNumber with document types
   * STORE_FRONT/SERVICE_CENTER/WAREHOUSE) the first time the corresponding
   * enable* toggle above flips from false to true — see
   * PUT /api/vendors/[id]. Never regenerated once set, even if the toggle
   * is later switched off and back on.
   */
  storeFrontId?:        string;
  serviceCenterId?:     string;
  warehouseFacilityId?: string;
  /**
   * Pincodes this vendor covers for on-site/service-center visits. Used by
   * the public appointment-request flow (POST /api/appointment-requests)
   * to route an incoming CrmCall to a matching vendor within the same
   * business — matching is always scoped by businessId first, this list is
   * only consulted among vendors already filtered to one business.
   */
  servicePincodes?: string[];
  /**
   * Tree-level coverage: each entry is a state, a state+city, or a single
   * pincode, assigned separately for onsite visits vs walk-in service
   * center drop-offs (the same SC can cover a whole state for walk-in but
   * only a few pincodes for onsite, or vice versa). "level" says which
   * granularity the entry represents; city/pincode are only set when
   * level narrows that far. Superset of the older servicePincodes (kept
   * for backward compatibility with existing exact-match matching).
   */
  serviceCoverage?: {
    onsite: { level: "STATE" | "CITY" | "PINCODE"; state: string; city?: string; pincode?: string }[];
    walkin: { level: "STATE" | "CITY" | "PINCODE"; state: string; city?: string; pincode?: string }[];
  };
  createdAt:  Date;
  updatedAt:  Date;
}

const VendorProfileSchema = new Schema<IVendorProfile>(
  {
    userId:       { type: Schema.Types.ObjectId, ref: 'User',     default: null },
    // No longer `required: true` — a general signup request (APPLIED, no
    // business chosen by the applicant) is created with this unset; the
    // admin sets it during /api/vendors/[id]/review's APPROVE step. Every
    // route that queries/lists vendors already filters by businessId
    // explicitly where it matters, so a temporarily-null value here is
    // safe — it just won't show up in any single business's vendor list
    // until approved.
    businessId:   { type: Schema.Types.ObjectId, ref: 'Business', default: null },
    // sparse -- vendorId is only assigned once a business is resolved (see
    // api/vendors/apply/route.ts), so multiple pending applications
    // legitimately have no vendorId yet. A plain `unique: true` index
    // treats every missing value as the same null and collides on the
    // second such document (E11000 dup key on vendorId_1), which is
    // exactly what happened in production.
    vendorId:     { type: String, unique: true, sparse: true },
    parentVendorId: { type: Schema.Types.ObjectId, ref: 'VendorProfile', default: null, index: true },

    telegramChatId: { type: String, trim: true, default: "" },
    telegramPersonalChatId: { type: String, trim: true, default: "" },
    telegramLinkCode: { type: String, default: null },
    telegramLinkCodeExpiresAt: { type: Date, default: null },
    trialEndsAt: { type: Date, default: null },
    earlyAccessAnchor: { type: Date, default: null },
    telegramReportFrequency: { type: String, enum: ["NONE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"], default: "NONE" },
    telegramReportLastSentAt: { type: Date },
    telegramReportTime: { type: String, trim: true, default: "09:00" },
    telegramMessageRouting: { type: Schema.Types.Mixed, default: {} },
    subVendorBilling: {
      subVendorPlan: { type: String, enum: ["NONE", "ALLOWED", "BLOCKED"], default: "NONE" },
      subVendorCount: { type: Number, default: 0 },
      subVendorChargePerAdd: { type: Number, default: 0 },
      subVendorChargeCurrency: { type: String, default: "INR" },
      lastChargedAt: { type: Date, default: null },
    },
    requestNumber: { type: String, unique: true, sparse: true },
    companyName:  { type: String, required: true },
    contactPerson: { type: String },
    email:        { type: String },              /* optional — not all vendors have a portal login */
    phone:        { type: String },
    address: {
      street:  { type: String },
      city:    { type: String },
      state:   { type: String },
      pincode: { type: String },
      country: { type: String, default: 'India' },
    },
    serviceCenterInfo: {
      hours:   { type: String },
      hotline: { type: String },
    },
    referredByCode: { type: String, trim: true },
    gstRegistered: { type: Boolean, default: false },
    gstNumber:  { type: String },
    agreementId:      { type: Schema.Types.ObjectId, ref: 'Agreement', default: null },
    reviewedBy:       { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt:       { type: Date, default: null },
    finalApprovedBy:  { type: Schema.Types.ObjectId, ref: 'User', default: null },
    finalApprovedAt:  { type: Date, default: null },
    rejectionReason:  { type: String, default: null },
    panNumber:  { type: String },
    bankDetails: {
      accountName:   { type: String },
      accountNumber: { type: String },
      ifscCode:      { type: String },
      bankName:      { type: String },
    },
    documents: {
      passbookUrl:              { type: String, default: null },
      passbookUploadedAt:       { type: Date, default: null },
      gstCertificateUrl:        { type: String, default: null },
      gstCertificateUploadedAt: { type: Date, default: null },
      compliance: { type: Schema.Types.Mixed, default: {} },
    },
    creditLimit:  { type: Number, default: 0 },
    paymentTerms: { type: String, default: '30 days' },
    // Default Marketplace channel commission % for this vendor's own
    // product pricing (core/pricing/pricingEngine.ts's "marketplace" tier)
    // -- e.g. what Amazon/Blinkit/a listing marketplace would take, so the
    // vendor can see what they'd net there. Typical range 5-25%; each
    // product can still override it via VendorProduct.pricingTiers.
    marketplaceCommissionPercent: { type: Number, default: 20, min: 0, max: 100 },
    category:     { type: String },
    businessType: { type: String },
    appliedAs:    { type: String, enum: ["SC"] },
    productCategories: [{ type: String, enum: DEVICE_CATEGORIES }],
    notes:        { type: String },
    // Vendor-editable service terms & conditions, shown on the
    // customer-facing workorder document -- each Service Center sets its
    // own, per explicit direction ("Allow vendors to update terms and
    // conditionals of their own").
    termsAndConditions: { type: String, default: '' },
    // Per-vendor operational settings -- see this schema's own interface
    // comment above for why these moved off the shared Business document.
    inventorySerialized: { type: Boolean, default: false },
    defaultLabourCharge: { type: Number, default: 0, min: 0 },
    customerLogoUrl: { type: String, default: '' },
    logoUrl: { type: String, default: '' },
    documentLogoUrl: { type: String, default: '' },
    documentSignatureUrl: { type: String, default: '' },
    documentLogoEnabled: { type: Boolean, default: false },
    documentLogoPosition: { type: String, enum: ["LEFT", "CENTER", "RIGHT"], default: "LEFT" },
    showDigitalDocumentNotice: { type: Boolean, default: false },
    showCcoNameOnPrint: { type: Boolean, default: false },
    applyTaxOnB2CBilling: { type: Boolean, default: true },
    workorderTerms: { type: String, default: '' },
    serviceOrderTerms: { type: String, default: '' },
    estimateTerms: { type: String, default: '' },
    invoiceTerms: { type: String, default: '' },
    savedBrands: [{ type: String }],
    savedModelsByBrand: { type: Schema.Types.Mixed, default: {} },
    savedPaymentCollectors: [{ type: String }],
    upiId: { type: String, default: '' },
    bankAccountName: { type: String, default: '' },
    bankAccountNumber: { type: String, default: '' },
    bankIFSC: { type: String, default: '' },
    bankName: { type: String, default: '' },
    rating:       { type: Number, min: 0, max: 5, default: 0 },
    status: {
      type:    String,
      enum:    ['APPLIED', 'PENDING', 'AGREEMENT_DRAFTED', 'AGREEMENT_SENT', 'AGREEMENT_SIGNED',
                'AGREEMENT_CANCELLED', 'APPROVED', 'ACTIVE', 'INACTIVE', 'REJECTED', 'SUSPENDED'],
      default: 'PENDING',
      index:   true,
    },
    isApproved: { type: Boolean, default: false },
    isDeleted:  { type: Boolean, default: false },
    enableStoreFront:    { type: Boolean, default: false },
    // Gates the public B2B partner ordering portal (/b2b/[vendorId]) --
    // self-signup, catalog, and order placement all check this. Kept
    // per-vendor rather than on the shared Business document: the same
    // Business can have several vendors, and this session already hit
    // real bugs from treating a Business-wide setting as if it were
    // vendor-specific (see the active-business-switcher issues fixed
    // earlier) -- a vendor toggling this only affects their own catalog.
    enableB2BOrdering:   { type: Boolean, default: false },
    enableServiceCenter: { type: Boolean, default: false },
    enableWarehouse:     { type: Boolean, default: false },
    storeFrontId:        { type: String, default: null },
    serviceCenterId:     { type: String, default: null },
    warehouseFacilityId: { type: String, default: null },
    servicePincodes:     { type: [String], default: [] },
    serviceCoverage: {
      onsite: {
        type: [{
          level:   { type: String, enum: ["STATE", "CITY", "PINCODE"], required: true },
          state:   { type: String, required: true },
          city:    { type: String },
          pincode: { type: String },
        }],
        default: [],
      },
      walkin: {
        type: [{
          level:   { type: String, enum: ["STATE", "CITY", "PINCODE"], required: true },
          state:   { type: String, required: true },
          city:    { type: String },
          pincode: { type: String },
        }],
        default: [],
      },
    },
  },
  { timestamps: true }
);

VendorProfileSchema.index({ businessId: 1, servicePincodes: 1 });

VendorProfileSchema.index({ businessId: 1, email: 1 });
VendorProfileSchema.index({ businessId: 1, status: 1 });
// Hot path for the vendor list page (filter by business, newest first)
VendorProfileSchema.index({ businessId: 1, isDeleted: 1, createdAt: -1 });
// Sub-vendor lookup: "which sub-vendors does this vendor have"
VendorProfileSchema.index({ parentVendorId: 1, isDeleted: 1 });

// CENTRAL-API SYNC (Phase A — dual write, see src/lib/centralApiSync.ts).
// Best-effort — a central-api outage never fails the local save/delete
// that triggered it. businessId AND parentVendorId are both already
// fields on this schema (parentVendorId is how a sub-vendor points at its
// parent vendor, which itself carries businessId) — the full business ->
// vendor -> sub-vendor identification/assignment chain travels through
// automatically as part of the synced document, no extra wiring needed
// here.
//
// These hooks ARE awaited (async function + await, not fire-and-forget):
// a Vercel serverless function can be frozen the instant its response is
// sent, which would silently kill an un-awaited sync mid-flight before it
// ever reaches central-api. Mongoose waits for a post hook's returned
// promise before resolving the save()/findOneAndUpdate() call.
VendorProfileSchema.post('save', async function (doc) {
  await syncRecordToCentralApi('vendors', doc._id.toString(), doc.toObject());
});

VendorProfileSchema.post('findOneAndUpdate', async function (doc) {
  // See Business.ts's identical hook for why this guards against .lean()
  // results (no .toObject()) instead of always calling it.
  if (doc) await syncRecordToCentralApi('vendors', doc._id.toString(), doc.toObject ? doc.toObject() : doc);
});

VendorProfileSchema.post('findOneAndDelete', async function (doc) {
  if (doc) await deleteRecordFromCentralApi('vendors', doc._id.toString());
});

const VendorProfile: Model<IVendorProfile> =
  mongoose.models.VendorProfile ||
  mongoose.model<IVendorProfile>('VendorProfile', VendorProfileSchema);

export default VendorProfile;
