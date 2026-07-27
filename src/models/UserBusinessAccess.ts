import mongoose from "mongoose";

const UserBusinessAccessSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },

    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },

    designation: {
      type: String,
      trim: true,
    },

    accessKeys: {
      type: [String],
      default: [],
    },

    reportingTo: {
      type: String,
      default: "",
    },

    isOwner: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

UserBusinessAccessSchema.index(
  {
    userId: 1,
    businessId: 1,
  },
  {
    unique: true,
  }
);

UserBusinessAccessSchema.index({
  businessId: 1,
});

UserBusinessAccessSchema.index({
  isActive: 1,
});

export default mongoose.models.UserBusinessAccess ||
  mongoose.model(
    "UserBusinessAccess",
    UserBusinessAccessSchema
  );
