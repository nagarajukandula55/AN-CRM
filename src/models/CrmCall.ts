/**
 * CrmCall — the core record of the CRM call lifecycle: call entry ->
 * disposition -> (optional) conversion into a JobSheet -> closure.
 *
 * This replaces the ad-hoc inline "Lead" schema that used to live in
 * app/api/crm/leads/route.ts and app/api/crm/leads/[id]/route.ts (each
 * declaring its own copy of the same shape — the same class of bug already
 * fixed for SalesInvoice, see that model's top comment). CrmCall is the
 * single source of truth for a call/lead record going forward; the legacy
 * Lead model/routes are left in place for backward compatibility but new
 * work should read/write CrmCall.
 *
 * Lifecycle (status):
 *   NEW -> CONTACTED -> QUALIFIED -> JOB_CREATED -> IN_PROGRESS -> CLOSED_WON
 *                                                                -> CLOSED_LOST
 * Any call can also be dropped at NOT_INTERESTED / NO_RESPONSE without ever
 * becoming a job.
 */

import mongoose, { Schema, Model, Document, Types } from "mongoose";
import { DEVICE_CATEGORIES, type DeviceCategory } from "@/core/catalog/deviceCategory";

export type CrmCallStatus =
  | "NEW"
  | "CONTACTED"
  | "QUALIFIED"
  | "JOB_CREATED"
  | "IN_PROGRESS"
  | "CLOSED_WON"
  | "CLOSED_LOST"
  | "NOT_INTERESTED"
  | "NO_RESPONSE";

export type CrmCallPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type CrmCallDisposition =
  | "INTERESTED"
  | "CALLBACK_REQUESTED"
  | "NOT_INTERESTED"
  | "NO_ANSWER"
  | "WRONG_NUMBER"
  | "CONVERTED"
  | "OTHER";

export interface ICrmCallLogEntry {
  _id?: Types.ObjectId;
  disposition: CrmCallDisposition;
  notes?: string;
  nextFollowUpAt?: Date;
  calledBy: Types.ObjectId;
  calledAt: Date;
}

export type CrmAppointmentType = "ONSITE" | "WALKIN";
export type CrmRequestType = "REPAIR" | "INSTALLATION";

export interface ICrmCall extends Document {
  businessId: Types.ObjectId;
  callNumber: string; // human-facing reference, e.g. CALL-2526-0001

  // ── Caller / customer details ──────────────────────────────────────
  customerName: string;
  company?: string;
  phone: string;
  email?: string;
  address?: string;
  // Structured, only meaningful (and only asked for in the UI) when
  // appointmentType is ONSITE -- an engineer needs a real address/city/
  // state/pincode to actually visit, not a free-text "address" alone.
  city?: string;
  state?: string;
  pincode?: string;

  // ── Enquiry details ─────────────────────────────────────────────────
  // "Website" (auto, submitted via the public appointment form) vs
  // "User Contact" (staff took the call/walk-in manually) -- the only two
  // values the appointment-creation UI actually offers now; source stays a
  // free-text field on the model since Referral/Ad still exist as legacy
  // values on old records.
  source?: string;
  product?: string; // device/category, e.g. "AC", "Washing Machine"
  // Structured device-type selection from the new Device Category taxonomy
  // (src/core/catalog/deviceCategory.ts) -- optional, parallel to how
  // deviceModelId below structures deviceModel. `product` above stays the
  // free-text legacy field (sourced from the unrelated ProductCategory
  // collection); deviceCategory is what scopes the Brand/Fault Code/
  // Symptom Code pickers in the appointment-creation UI to one device type.
  deviceCategory?: DeviceCategory | null;
  brandId?: Types.ObjectId; // ref Brand
  // Same "typed but not yet approved" free-text stand-in as
  // CrmJobSheet.pendingBrandName -- see that field's comment.
  pendingBrandName?: string;
  deviceModel?: string;
  // Structured model selection -- optional; deviceModel above stays the
  // display string (also carries a one-off typed value for a model not
  // in the DeviceModel master yet). deviceModelId is what lets the
  // workorder's BOM-part picker filter to exactly this model instead of
  // just the brand.
  deviceModelId?: Types.ObjectId; // ref DeviceModel
  // Structured series selection -- optional, sits between Brand and Model
  // in the catalog tree (Brand -> Series -> DeviceModel, see Series.ts).
  // Same optional-ObjectId-ref pattern as variantId below; a model can
  // attach directly to a Brand with no Series ("Direct"), so this stays
  // unset in that case.
  seriesId?: Types.ObjectId; // ref Series
  // Structured variant selection -- optional, only meaningful once a
  // deviceModelId is picked; same optional-ObjectId-ref pattern as
  // DeviceModel.seriesId. Lets a specific RAM/Storage/Colour variant round
  // -trip into the job sheet at conversion time.
  variantId?: Types.ObjectId; // ref Variant
  // Structured fault selection -- optional; the free-text subject field
  // below still carries the actual "Fault in Device" description shown
  // required in the UI, faultCodeId just links it to the Fault Code
  // catalog (same catalog used on JobSheet) so it round-trips into the
  // job sheet at conversion time instead of only living as text.
  faultCodeId?: Types.ObjectId; // ref FaultCode
  // Same rationale as faultCodeId, but for the observed Symptom Code
  // catalog -- previously CrmCall had no structured symptom field at all
  // (SymptomCode existed but was never surfaced on this model).
  symptomCodeId?: Types.ObjectId; // ref SymptomCode
  subject: string; // the "Fault in Device" text -- kept as the schema's
  // required field name so nothing downstream (job sheet conversion,
  // search, etc.) needs to change; the UI just labels it "Fault in Device".
  description?: string;
  priority: CrmCallPriority;

  // Onsite (engineer visits the customer) vs Walkin (customer brings the
  // device in); Repair vs Installation -- captured at appointment time so
  // the job sheet created from this call doesn't have to ask again.
  appointmentType: CrmAppointmentType;
  requestType: CrmRequestType;
  // When the appointment is actually scheduled for -- distinct from
  // nextFollowUpAt (a callback reminder) and from JobSheet.scheduledAt
  // (set later, when a job sheet exists at all).
  appointmentDate?: Date;

  // ── Pipeline ─────────────────────────────────────────────────────────
  status: CrmCallStatus;
  assignedTo?: Types.ObjectId;
  callLogs: ICrmCallLogEntry[];
  nextFollowUpAt?: Date;

  // ── Conversion / closure ────────────────────────────────────────────
  jobSheetId?: Types.ObjectId;
  closedAt?: Date;
  closedReason?: string;
  estimatedValue?: number;
  currency: string;

  // Which VendorProfile this call/appointment is routed to for service
  // fulfilment -- distinct from assignedTo (refs User, the internal staff
  // member handling the call). Set automatically when exactly one vendor's
  // pincode coverage matches a public appointment request (see
  // app/api/appointment-requests/route.ts), or manually by a Super Admin
  // via app/api/crm/calls/[id]/assign-vendor/route.ts when no single vendor
  // auto-matched (zero or multiple candidates).
  routedVendorId?: Types.ObjectId; // ref VendorProfile

  tags: string[];
  isDeleted: boolean;
  /**
   * Optional — a public, unauthenticated submission (see
   * app/api/appointment-requests/route.ts) has no logged-in user to
   * attribute the record to. Same pattern as Review.userId in
   * app/api/reviews/route.ts: nullable rather than force-fitting a fake
   * "system user". Every authenticated write path (app/api/crm/calls/route.ts)
   * still always sets this from the session.
   */
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CrmCallLogSchema = new Schema<ICrmCallLogEntry>(
  {
    disposition: {
      type: String,
      enum: [
        "INTERESTED",
        "CALLBACK_REQUESTED",
        "NOT_INTERESTED",
        "NO_ANSWER",
        "WRONG_NUMBER",
        "CONVERTED",
        "OTHER",
      ],
      required: true,
    },
    notes: { type: String, default: "" },
    nextFollowUpAt: { type: Date },
    calledBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    calledAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const CrmCallSchema = new Schema<ICrmCall>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    callNumber: { type: String, required: true, index: true },

    customerName: { type: String, required: true, trim: true },
    company: { type: String, trim: true },
    phone: { type: String, required: true, trim: true, index: true },
    email: { type: String, lowercase: true, trim: true },
    address: { type: String },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },

    source: { type: String, default: "" },
    product: { type: String, trim: true },
    deviceCategory: { type: String, enum: DEVICE_CATEGORIES, default: null },
    brandId: { type: Schema.Types.ObjectId, ref: "Brand" },
    pendingBrandName: { type: String, trim: true },
    deviceModel: { type: String, trim: true },
    deviceModelId: { type: Schema.Types.ObjectId, ref: "DeviceModel" },
    seriesId: { type: Schema.Types.ObjectId, ref: "Series" },
    variantId: { type: Schema.Types.ObjectId, ref: "Variant" },
    faultCodeId: { type: Schema.Types.ObjectId, ref: "FaultCode" },
    symptomCodeId: { type: Schema.Types.ObjectId, ref: "SymptomCode" },
    subject: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
      default: "MEDIUM",
    },

    appointmentType: { type: String, enum: ["ONSITE", "WALKIN"], default: "WALKIN" },
    requestType: { type: String, enum: ["REPAIR", "INSTALLATION"], default: "REPAIR" },
    appointmentDate: { type: Date, index: true },

    status: {
      type: String,
      enum: [
        "NEW",
        "CONTACTED",
        "QUALIFIED",
        "JOB_CREATED",
        "IN_PROGRESS",
        "CLOSED_WON",
        "CLOSED_LOST",
        "NOT_INTERESTED",
        "NO_RESPONSE",
      ],
      default: "NEW",
      index: true,
    },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User" },
    callLogs: { type: [CrmCallLogSchema], default: [] },
    nextFollowUpAt: { type: Date, index: true },

    jobSheetId: { type: Schema.Types.ObjectId, ref: "CrmJobSheet" },
    closedAt: { type: Date },
    closedReason: { type: String },
    estimatedValue: { type: Number, default: 0 },
    currency: { type: String, default: "INR" },

    routedVendorId: { type: Schema.Types.ObjectId, ref: "VendorProfile", index: true },

    tags: { type: [String], default: [] },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

// Multi-tenant hot path: call lists are always filtered by businessId and
// sorted newest-first / by status — same reasoning as SalesInvoice's indexes.
CrmCallSchema.index({ businessId: 1, createdAt: -1 });
CrmCallSchema.index({ businessId: 1, status: 1 });
CrmCallSchema.index({ businessId: 1, assignedTo: 1, status: 1 });
CrmCallSchema.index({ businessId: 1, callNumber: 1 }, { unique: true });

const CrmCall: Model<ICrmCall> =
  (mongoose.models.CrmCall as Model<ICrmCall>) ||
  mongoose.model<ICrmCall>("CrmCall", CrmCallSchema);

export default CrmCall;
