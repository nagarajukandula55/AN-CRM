import mongoose from "mongoose";

const BlogSchema = new mongoose.Schema(
  {
    title: String,
    slug: {
      type: String,
      unique: true,
    },
    excerpt: String,
    content: String,
    image: String,
    category: String,
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export default mongoose.models.Blog || mongoose.model("Blog", BlogSchema);
