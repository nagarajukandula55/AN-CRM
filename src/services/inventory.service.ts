import Inventory from "@/models/Inventory";
import InventoryTransaction from "@/models/InventoryTransaction";

export async function updateInventoryStock({
  businessId,
  warehouseId,

  itemType,

  materialId,
  productVariantId,

  itemCode,
  itemName,
  sku,
  unit,

  transactionType,

  quantity,

  unitCost = 0,

  referenceType = "SYSTEM",

  referenceId = null,

  referenceNumber = "",

  remarks = "",

  createdBy = null,
}: any) {
  let inventory = await Inventory.findOne({
    warehouseId,
    materialId: materialId || null,
    productVariantId: productVariantId || null,
    active: true,
  });

  if (!inventory) {
    inventory = await Inventory.create({
      businessId,

      warehouseId,

      itemType,

      materialId,

      productVariantId,

      itemCode,

      itemName,

      sku,

      unit,

      onHandQuantity: 0,

      reservedQuantity: 0,

      availableQuantity: 0,

      averageCost: 0,

      totalValue: 0,
    });
  }

  switch (transactionType) {
    case "OPENING":

    case "PURCHASE":

    case "GRN":

    case "RETURN":

    case "TRANSFER_IN":

    case "MANUFACTURING_IN":

      inventory.onHandQuantity += quantity;

      break;

    case "SALE":

    case "TRANSFER_OUT":

    case "MANUFACTURING_OUT":

      inventory.onHandQuantity -= quantity;

      break;

    case "RESERVATION":

      inventory.reservedQuantity += quantity;

      break;

    case "RESERVATION_RELEASE":

      inventory.reservedQuantity -= quantity;

      break;

    case "ADJUSTMENT":

      inventory.onHandQuantity += quantity;

      break;
  }

  inventory.availableQuantity =
    inventory.onHandQuantity -
    inventory.reservedQuantity -
    inventory.damagedQuantity -
    inventory.blockedQuantity;

  inventory.averageCost = unitCost;

  inventory.totalValue =
    inventory.availableQuantity *
    inventory.averageCost;

  inventory.lastTransactionDate =
    new Date();

  inventory.lastTransactionType =
    transactionType;

  await inventory.save();

  await InventoryTransaction.create({
    businessId,

    warehouseId,

    itemType,

    materialId,

    productVariantId,

    itemCode,

    itemName,

    sku,

    unit,

    transactionType,

    quantity,

    unitCost,

    totalCost:
      quantity * unitCost,

    referenceType,

    referenceId,

    referenceNumber,

    remarks,

    createdBy,
  });

  return inventory;
}
