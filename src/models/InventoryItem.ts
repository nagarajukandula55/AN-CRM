/**
 * InventoryItem — alias for the Inventory model
 * The existing API routes import "@/models/InventoryItem".
 * This bridge re-exports Inventory so both names work.
 */
import mongoose from "mongoose";

// Import the JS model (Inventory.js) via its registered name
// so we don't duplicate the schema
const InventoryItem =
  mongoose.models.Inventory ||
  (() => {
    // Dynamically load Inventory.js to ensure it's registered
    require("./Inventory");
    return mongoose.models.Inventory;
  })();

export default InventoryItem;
