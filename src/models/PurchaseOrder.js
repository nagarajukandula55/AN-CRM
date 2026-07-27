import mongoose from "mongoose";

const PurchaseOrderSchema = new mongoose.Schema(
{
    /* =========================================================
       BUSINESS
    ========================================================= */

    businessId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Business",
        required:true,
        index:true
    },

    vendorId:{
        type:mongoose.Schema.Types.ObjectId,
        // Was ref:"Vendor" -- the legacy, superseded vendor model.
        // /api/vendors (the route this form's vendor dropdown actually
        // fetches from) and every other live vendor system in the app
        // use VendorProfile -- populate("vendorId") against "Vendor" was
        // silently returning nothing for every real vendor id, and
        // purchaseOrder.service.ts's Vendor.findById(vendorId) lookup at
        // creation time meant selecting ANY vendor from the dropdown
        // always failed with "Vendor not found".
        ref:"VendorProfile",
        required:true,
        index:true
    },

    warehouseId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Warehouse",
        required:true,
        index:true
    },

    /* =========================================================
       DOCUMENT
    ========================================================= */

    poNumber:{
        type:String,
        required:true,
        uppercase:true,
        trim:true,
    },

    version:{
        type:Number,
        default:1
    },

    orderType:{
        type:String,
        enum:[
            "STANDARD",
            "URGENT",
            "RECURRING"
        ],
        default:"STANDARD"
    },

    priority:{
        type:String,
        enum:[
            "LOW",
            "MEDIUM",
            "HIGH",
            "CRITICAL"
        ],
        default:"MEDIUM"
    },

    /* =========================================================
       DATES
    ========================================================= */

    orderDate:{
        type:Date,
        default:Date.now
    },

    expectedDate:Date,

    deliveryDate:Date,

    /* =========================================================
       COMMERCIAL
    ========================================================= */

    currency:{
        type:String,
        default:"INR"
    },

    paymentTerms:String,

    deliveryTerms:String,

    freightTerms:String,

    /* =========================================================
       TOTALS
    ========================================================= */

    subtotal:{
        type:Number,
        default:0
    },

    taxAmount:{
        type:Number,
        default:0
    },

    discountAmount:{
        type:Number,
        default:0
    },

    freightAmount:{
        type:Number,
        default:0
    },

    otherCharges:{
        type:Number,
        default:0
    },

    totalAmount:{
        type:Number,
        default:0
    },

    /* =========================================================
       RECEIVING SUMMARY
    ========================================================= */

    totalOrderedQty:{
        type:Number,
        default:0
    },

    totalReceivedQty:{
        type:Number,
        default:0
    },

    totalPendingQty:{
        type:Number,
        default:0
    },

    /* =========================================================
       STATUS
    ========================================================= */

    status: {
      type: String,
      enum: [
        "DRAFT",
        "PENDING_APPROVAL",
        "APPROVED",
        "PARTIAL_RECEIVED",
        "RECEIVED",
        "REJECTED",
        "CANCELLED",
        "CLOSED",
      ],
        default:"DRAFT",
        index:true
    },

    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    
    submittedAt: Date,
    
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    
    approvedAt: Date,
    
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    
    rejectedAt: Date,
    
    rejectionReason: {
      type: String,
      default: "",
    },
    
    closedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    
    closedAt: Date,

    approvalRemarks:String,

    cancellationReason:String,

    remarks:String,

    /* =========================================================
       APPROVAL
    ========================================================= */

    submittedBy:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
    },

    submittedAt:Date,

    approvedBy:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
    },

    approvedAt:Date,

    cancelledBy:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
    },

    cancelledAt:Date,

    /* =========================================================
       ATTACHMENTS
    ========================================================= */

    attachments:[
        {
            fileName:String,
            fileUrl:String,
            uploadedAt:{
                type:Date,
                default:Date.now
            }
        }
    ],

    /* =========================================================
       SYSTEM
    ========================================================= */

    createdBy:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true
    },

    active:{
        type:Boolean,
        default:true
    }

},
{
    timestamps:true
}
);

/* =========================================================
   INDEXES
========================================================= */

PurchaseOrderSchema.index({
    vendorId:1,
    status:1
});

PurchaseOrderSchema.index({
    warehouseId:1,
    status:1
});

PurchaseOrderSchema.index({
    businessId:1,
    orderDate:-1
});

PurchaseOrderSchema.index({
    expectedDate:1
});

// poNumber was GLOBALLY unique -- two businesses both using the default
// (uncustomized) PO prefix generate identical numbers (numberingService.ts
// resets its counter per business, not the prefix), so the second
// business's first PO would hard-fail on a duplicate-key error. Scoped
// per-business instead.
PurchaseOrderSchema.index({ businessId: 1, poNumber: 1 }, { unique: true });

export default
mongoose.models.PurchaseOrder ||
mongoose.model(
"PurchaseOrder",
PurchaseOrderSchema
);
