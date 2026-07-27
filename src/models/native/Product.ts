import mongoose from "mongoose";

const ProductSchema = new mongoose.Schema(
  {
    name: String,
    price: Number,
    mrp: Number,
    stock: Number,
    status: String,
    gstPercent: Number,
    sku: String,
  },
  { timestamps: true }
);

export function getProductModel(conn: mongoose.Connection) {
  return (
    conn.models.Product ||
    conn.model("Product", ProductSchema)
  );
}
