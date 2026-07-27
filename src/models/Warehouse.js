import mongoose from "mongoose";

const WarehouseSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
    },

    // Optional — a warehouse is either owned directly by a business, OR by
    // one specific vendor operating under that business (hierarchy: AN
    // Group > Businesses > Vendors > Warehouses > Staff). When set, this
    // warehouse belongs to the vendor's own operation and should only be
    // visible/manageable from that vendor's portal, not the business's
    // general warehouse list.
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VendorProfile",
      default: null,
    },

    warehouseCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },

    warehouseName: {
      type: String,
      required: true,
      trim: true,
    },

    warehouseType: {
      type: String,
      enum: [
        "RAW_MATERIAL",
        "FINISHED_GOODS",
        "DISTRIBUTION",
        "STORE",
        "PRODUCTION",
        // Added per explicit user request: a vendor-operated (or
        // business-operated) service center — reuses this same schema
        // (vendor/business scoping, address, capacity) rather than a new
        // model, since nothing about a service center's actual data shape
        // differs from a warehouse's.
        "SERVICE_CENTER",
      ],
      default: "RAW_MATERIAL",
    },

    contactPerson: String,

    mobile: String,

    email: String,

    address: String,

    city: String,

    district: String,

    state: String,

    pincode: String,

    country: {
      type: String,
      default: "India",
    },

    managerName: String,

    capacity: {
      type: Number,
      default: 0,
    },

    notes: String,

    // Optional override for documents (invoices/workorders/estimates)
    // issued from this specific service center/warehouse -- falls back to
    // the owning Business.logo if not set. See core/documentTemplates/resolve.ts.
    logoUrl: {
      type: String,
      default: "",
    },

    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.Warehouse ||
  mongoose.model(
    "Warehouse",
    WarehouseSchema
  );
