import mongoose from "mongoose";

const DesignSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },

    width: {
      type: Number,
      default: 100,
    },

    height: {
      type: Number,
      default: 50,
    },

    canvasJson: {
      type: Object,
      default: {},
    },

    thumbnail: {
      type: String,
      default: "",
    },

    category: {
      type: String,
      default: "label",
    },

    tags: {
      type: [String],
      default: [],
    },

    version: {
      type: Number,
      default: 1,
    },

    status: {
      type: String,
      default: "Draft",
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.Design ||
  mongoose.model("Design", DesignSchema);
