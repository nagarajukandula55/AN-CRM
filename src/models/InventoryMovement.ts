/**
 * InventoryMovement — alias for the InventoryTransaction model
 * The existing API routes import "@/models/InventoryMovement".
 * This bridge re-exports InventoryTransaction.
 */
import mongoose from "mongoose";

const InventoryMovement =
  mongoose.models.InventoryTransaction ||
  (() => {
    require("./InventoryTransaction");
    return mongoose.models.InventoryTransaction;
  })();

export default InventoryMovement;
