/**
 * CrmJobSheet — created when a CrmCall is converted into actual work
 * (a technician visit, a service job, a fulfillment task, etc.). This is
 * the "call entry -> job sheet -> invoice -> closure" middle step the CRM
 * lifecycle needs: it records what work was scoped/performed, by whom, and
 * links forward to the SalesInvoice generated at closure.
 *
 * Deliberately generic ("lineItems" with free-text description + qty/rate,
 * not tied to the Product catalog) so it works for a pure-service business
 * (AC repair, consulting visit) as well as a goods+service business,
 * without forcing every job through the full Product/Inventory pipeline.
 * A job sheet's lineItems are copied into the SalesInvoice's items at
 * closure — see /api/crm/jobsheets/[id]/close/route.ts.
 */

import mongoose, { Schema, Model, Document, Types } from "mongoose";
import { DEVICE_CATEGORIES, type DeviceCategory } from "@/core/catalog/deviceCategory";

// Milestone stepper, per explicit spec:
//   CREATED         -- workorder just created (from an appointment or direct)
//   REPAIR_STARTED  -- CCO assigned it to an engineer
//   REPAIR_IN_PROGRESS -- engineer is actively working the job
//   REPAIR_COMPLETED   -- parts/solution selected, workorder+invoice
//                          downloadable, awaiting handover
//   CLOSED          -- SC recorded payment collected + handed over to customer
//   CANCELLED       -- vendor requested cancel, routed to manager
// Old DRAFT/SCHEDULED/IN_PROGRESS/PART_PENDING/COMPLETED/INVOICED enum
// replaced outright (this is the milestone system now, not the old
// technician-scheduling one) -- see the numbered transition routes under
// api/crm/jobsheets/[id]/ (assign-engineer, start-repair, complete-repair,
// handover, cancel).
export type CrmJobSheetStatus =
  | "CREATED"
  | "REPAIR_STARTED"
  | "REPAIR_IN_PROGRESS"
  // Repair paused waiting on a part order -- entered from
  // REPAIR_IN_PROGRESS via api/crm/jobsheets/[id]/part-pending, exited
  // back to REPAIR_IN_PROGRESS via .../resume-repair once the part
  // arrives. Not on the main milestone track (same branch treatment as
  // CANCELLED) since it's a pause, not forward progress.
  | "PART_PENDING"
  | "REPAIR_COMPLETED"
  | "CLOSED"
  | "CANCELLED";

export interface ICrmJobSheetLineItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxRate: number;
  hsnCode?: string; // set when the line was picked from BOM
  // Snapshot of the source BOM entry's Material Code
  // (partCode), per the standard line-item field set: "Solution,
  // Description, Material Code, Qty, Rate, Tax%, Cost". Set alongside
  // serviceCenterBOMId when a line is picked from the BOM; stays legible
  // on the printed job sheet even if that BOM entry is later edited/
  // deactivated.
  materialCode?: string;
  // Pre-tax line cost (quantity * unitPrice), stored rather than only
  // derived client-side so the printed job sheet's "Cost" column and any
  // reporting on it stay stable even if quantity/unitPrice display
  // formatting changes later.
  cost?: number;
  serviceCenterBOMId?: Types.ObjectId; // ref BOM, if picked from BOM
  // Per-line diagnosis fields, per explicit direction: each item on the
  // repair table gets its own Fault Phenomenon/Symptom/Solution rather than
  // one shared set for the whole job sheet (moved off the job-sheet-level
  // symptomCodeId/solutionId below, which are still populated -- derived
  // from the line items at save time -- so the Service Record print page
  // keeps working unchanged).
  faultCodeId?: Types.ObjectId; // ref FaultCode
  symptomCodeId?: Types.ObjectId; // ref SymptomCode
  solutionId?: Types.ObjectId; // ref Solution
}

export interface ICrmJobSheet extends Document {
  businessId: Types.ObjectId;
  jobSheetNumber: string;
  // Service center this job sheet was issued from -- optional; when set,
  // its Warehouse.logoUrl overrides the business logo on the printed
  // workorder/estimate. See core/documentTemplates/resolve.ts.
  warehouseId?: Types.ObjectId;

  callId?: Types.ObjectId; // originating CrmCall -- absent for a standalone/walk-in job sheet
  customerName: string;
  company?: string;
  // GSTIN for a B2B customer -- close/route.ts's invoice generation
  // treats a job sheet with `company` set as B2B, but had nowhere to
  // source the actual GST number from, so a real GST invoice could never
  // be produced from a workorder. See jobsheets/route.ts (create) and
  // close/route.ts (invoice generation) for where this is consumed.
  gstin?: string;
  phone: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;

  // Workorder-creation fields (per CRM Appointment -> Workorder spec):
  product?: string; // device/category, e.g. "AC", "Washing Machine"
  // Structured device-type selection -- see CrmCall.deviceCategory's
  // matching comment for the full rationale (product above stays the
  // legacy free-text field).
  deviceCategory?: DeviceCategory | null;
  brandId?: Types.ObjectId; // ref Brand
  // Free-text stand-in for brandId, set only when the user raised a
  // "Request to add" Brand request that's still pending approval -- lets
  // this job sheet be submitted now with the typed name instead of
  // blocking until a Super Admin approves it (see CatalogRequestModal /
  // DeviceCatalogFields). Cleared/backfilled with the real brandId once
  // approved is out of scope for now; this just records what was typed.
  pendingBrandName?: string;
  deviceModel?: string;
  // Structured model selection -- optional; deviceModel above stays the
  // display string. deviceModelId is what lets the Service Info table's
  // BOM-part picker filter to exactly this model, not just the brand
  // (see /api/service-center-bom's deviceModelId filter).
  deviceModelId?: Types.ObjectId; // ref DeviceModel
  // Structured series selection -- optional, same pattern as
  // CrmCall.seriesId; carried over from the originating call at
  // conversion time when set there.
  seriesId?: Types.ObjectId; // ref Series
  // Structured variant selection -- optional, same pattern as
  // CrmCall.variantId; carried over from the originating call at
  // conversion time when set there.
  variantId?: Types.ObjectId; // ref Variant
  imeiOrSerialNumber?: string;
  issueDescription?: string; // free-text VOC, independent of faultCodeId
  faultCodeId?: Types.ObjectId; // ref FaultCode
  remark?: string;
  // Intake-time fields, captured when the device is dropped off (at
  // standalone workorder creation, or when converting an appointment into
  // one) -- shown on the intake receipt printed before repair starts/
  // before the call is closed (see api/crm/jobsheets/[id]/intake-receipt).
  // warrantyStatus also feeds the materials table's "Type of charge" on
  // the post-close Service Record.
  warrantyStatus?: "IW" | "OOW";
  deviceAppearance?: "GOOD" | "USED" | "DENTS" | "BROKEN";
  fileBackupDescription?: "YES" | "NO"; // did the customer back up their data before drop-off
  standardAccessories?: string; // e.g. "Card tray, Charger"
  specialDescription?: string; // additional intake notes distinct from the fault itself
  // Carried over from the originating call/appointment (see CrmCall) so
  // the workorder doesn't have to ask again.
  appointmentType?: "ONSITE" | "WALKIN";
  requestType?: "REPAIR" | "INSTALLATION";

  // Set when status moves to PART_PENDING — optional brand job number for
  // the part order, per spec ("ask if have Brand Job No for Part Order").
  brandJobNoForPartOrder?: string;

  title: string;
  description?: string;
  scheduledAt?: Date;
  completedAt?: Date;

  assignedTo?: Types.ObjectId; // engineer performing the job
  // Snapshot of the assigned engineer's name -- per explicit direction
  // ("Also Engineer name while closing the call"), captured at assignment
  // time (see assign-engineer/route.ts) and again refreshed at close time
  // so the printed job sheet/invoice always shows a readable engineer
  // name without needing a populate, and survives that user account
  // being renamed or deleted later.
  assignedToName?: string;
  assignedBy?: Types.ObjectId; // CCO who made the assignment
  engineerAssignedAt?: Date;
  status: CrmJobSheetStatus;

  // Milestone timestamps -- one per status transition, for the milestone
  // stepper's date/time display and TAT (createdAt -> repairCompletedAt)
  // on the Workorders list. engineerAssignedAt above already covers
  // CREATED -> REPAIR_STARTED; completedAt/handedOverAt below already
  // cover REPAIR_COMPLETED/CLOSED -- these three fill the remaining gaps.
  repairInProgressAt?: Date; // REPAIR_STARTED -> REPAIR_IN_PROGRESS (start-repair)
  partPendingAt?: Date; // -> PART_PENDING
  repairResumedAt?: Date; // PART_PENDING -> REPAIR_IN_PROGRESS (resume-repair)

  lineItems: ICrmJobSheetLineItem[];
  taxApplyEnabled?: boolean;
  materialsUsed?: string;
  workPerformed?: string;
  // Structured solution reference alongside the free-text workPerformed
  // above -- optional, doesn't replace it.
  solutionId?: Types.ObjectId;
  // Observed symptom (SymptomCode catalog) -- distinct from the fault
  // diagnosed on the originating CrmCall/job title; recorded during the
  // repair flow.
  symptomCodeId?: Types.ObjectId;
  // Flat service charge, separate from parts/labour line items --
  // editable only by Owner/Manager (enforced client-side; see the job
  // sheet detail page), included in the invoice total at closure.
  serviceCharge?: number;
  customerSignatureUrl?: string;
  internalNotes?: string;

  // Cancellation -- vendor staff requests it, routed to the vendor's own
  // Manager (the main login), per spec ("access to Cancel to manager").
  cancelReason?: string;
  cancelRequestedBy?: Types.ObjectId;
  cancelledAt?: Date;

  // Handover (final milestone) -- SC records what was actually collected.
  paymentCollected?: number;
  paymentMode?: "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "OTHER";
  // Free-text name of the staff member who physically collected the
  // payment -- distinct from handedOverBy (the logged-in user recording
  // the handover, which is always the single SC login and so never
  // varies) -- per explicit direction to actually track who took the cash.
  paymentCollectedByName?: string;
  handedOverAt?: Date;
  handedOverBy?: Types.ObjectId;

  // NPS/service-feedback survey -- feedbackToken is generated at handover
  // (see api/crm/jobsheets/[id]/handover/route.ts) so the public survey
  // link (/feedback/service/[token]) exists as soon as there's a delivered
  // job to survey. feedbackRequestSentAt marks when the follow-up
  // SMS/WhatsApp was actually sent (1 hour after handedOverAt, see
  // api/cron/service-feedback-followup/route.ts) so the cron sweep never
  // sends it twice.
  feedbackToken?: string;
  feedbackRequestSentAt?: Date;

  invoiceId?: Types.ObjectId; // SalesInvoice created at closure
  invoiceNumber?: string;

  isDeleted: boolean;
  createdBy: Types.ObjectId;
  // Snapshot of the CCO's name -- copied from the originating CrmCall's
  // createdByName when this job sheet was converted from a call, or the
  // creating user's own name for a standalone job sheet. Per explicit
  // direction ("CCO name should be taken and same should come on Job
  // sheet"). Stored as plain text for the same reasons as
  // assignedToName -- survives account changes, no populate needed to
  // print.
  ccoName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CrmJobSheetLineItemSchema = new Schema<ICrmJobSheetLineItem>(
  {
    description: { type: String, required: true },
    quantity: { type: Number, default: 1 },
    unit: { type: String, default: "pcs" },
    unitPrice: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 },
    hsnCode: { type: String },
    materialCode: { type: String, trim: true, default: "" },
    cost: { type: Number, default: 0 },
    serviceCenterBOMId: { type: Schema.Types.ObjectId, ref: "BOM" },
    faultCodeId: { type: Schema.Types.ObjectId, ref: "FaultCode" },
    symptomCodeId: { type: Schema.Types.ObjectId, ref: "SymptomCode" },
    solutionId: { type: Schema.Types.ObjectId, ref: "Solution" },
  },
  { _id: false }
);

const CrmJobSheetSchema = new Schema<ICrmJobSheet>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    jobSheetNumber: { type: String, required: true, index: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: "Warehouse", default: null },

    // Was `required: true` -- directly contradicted this route's own
    // documented purpose ("create a STANDALONE job sheet, not tied to a
    // call -- e.g. a direct walk-in service request", see
    // api/crm/jobsheets/route.ts's top comment). Every walk-in/direct
    // job sheet creation failed schema validation outright; only
    // call-conversion (which does set callId) ever worked.
    callId: { type: Schema.Types.ObjectId, ref: "CrmCall", index: true },
    customerName: { type: String, required: true, trim: true },
    company: { type: String, trim: true },
    gstin: { type: String, trim: true, uppercase: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    address: { type: String },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },

    product: { type: String, trim: true },
    deviceCategory: { type: String, enum: DEVICE_CATEGORIES, default: null },
    brandId: { type: Schema.Types.ObjectId, ref: "Brand" },
    pendingBrandName: { type: String, trim: true },
    deviceModel: { type: String, trim: true },
    deviceModelId: { type: Schema.Types.ObjectId, ref: "DeviceModel" },
    seriesId: { type: Schema.Types.ObjectId, ref: "Series" },
    variantId: { type: Schema.Types.ObjectId, ref: "Variant" },
    imeiOrSerialNumber: { type: String, trim: true },
    issueDescription: { type: String, default: "" },
    faultCodeId: { type: Schema.Types.ObjectId, ref: "FaultCode" },
    remark: { type: String, default: "" },
    warrantyStatus: { type: String, enum: ["IW", "OOW"] },
    deviceAppearance: { type: String, enum: ["GOOD", "USED", "DENTS", "BROKEN"] },
    fileBackupDescription: { type: String, enum: ["YES", "NO"] },
    standardAccessories: { type: String, default: "" },
    specialDescription: { type: String, default: "" },
    appointmentType: { type: String, enum: ["ONSITE", "WALKIN"] },
    requestType: { type: String, enum: ["REPAIR", "INSTALLATION"] },

    brandJobNoForPartOrder: { type: String, trim: true },

    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    scheduledAt: { type: Date },
    completedAt: { type: Date },

    assignedTo: { type: Schema.Types.ObjectId, ref: "User" },
    assignedToName: { type: String, trim: true, default: "" },
    assignedBy: { type: Schema.Types.ObjectId, ref: "User" },
    engineerAssignedAt: { type: Date },
    repairInProgressAt: { type: Date },
    partPendingAt: { type: Date },
    repairResumedAt: { type: Date },
    status: {
      type: String,
      enum: ["CREATED", "REPAIR_STARTED", "REPAIR_IN_PROGRESS", "PART_PENDING", "REPAIR_COMPLETED", "CLOSED", "CANCELLED"],
      default: "CREATED",
      index: true,
    },

    lineItems: { type: [CrmJobSheetLineItemSchema], default: [] },
    taxApplyEnabled: { type: Boolean, default: true },
    materialsUsed: { type: String, default: "" },
    serviceCharge: { type: Number, default: 0 },
    workPerformed: { type: String, default: "" },
    solutionId: { type: Schema.Types.ObjectId, ref: "Solution", default: null },
    symptomCodeId: { type: Schema.Types.ObjectId, ref: "SymptomCode", default: null },
    customerSignatureUrl: { type: String, default: "" },
    internalNotes: { type: String, default: "" },

    cancelReason: { type: String },
    cancelRequestedBy: { type: Schema.Types.ObjectId, ref: "User" },
    cancelledAt: { type: Date },

    paymentCollected: { type: Number },
    paymentMode: { type: String, enum: ["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"] },
    paymentCollectedByName: { type: String, trim: true },
    handedOverAt: { type: Date },
    handedOverBy: { type: Schema.Types.ObjectId, ref: "User" },

    feedbackToken: { type: String, index: true },
    feedbackRequestSentAt: { type: Date },

    invoiceId: { type: Schema.Types.ObjectId, ref: "SalesInvoice" },
    invoiceNumber: { type: String },

    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    ccoName: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

CrmJobSheetSchema.index({ businessId: 1, createdAt: -1 });
CrmJobSheetSchema.index({ businessId: 1, status: 1 });
CrmJobSheetSchema.index({ businessId: 1, jobSheetNumber: 1 }, { unique: true });

const CrmJobSheet: Model<ICrmJobSheet> =
  (mongoose.models.CrmJobSheet as Model<ICrmJobSheet>) ||
  mongoose.model<ICrmJobSheet>("CrmJobSheet", CrmJobSheetSchema);

export default CrmJobSheet;
