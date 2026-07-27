import mongoose, { Schema, Document, Model } from 'mongoose';
import { DEVICE_CATEGORIES, type DeviceCategory } from '@/core/catalog/deviceCategory';

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
    vendorId:     { type: String, unique: true },
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
    productCategories: [{ type: String, enum: DEVICE_CATEGORIES }],
    notes:        { type: String },
    // Vendor-editable service terms & conditions, shown on the
    // customer-facing workorder document -- each Service Center sets its
    // own, per explicit direction ("Allow vendors to update terms and
    // conditionals of their own").
    termsAndConditions: { type: String, default: '' },
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

const VendorProfile: Model<IVendorProfile> =
  mongoose.models.VendorProfile ||
  mongoose.model<IVendorProfile>('VendorProfile', VendorProfileSchema);

export default VendorProfile;
