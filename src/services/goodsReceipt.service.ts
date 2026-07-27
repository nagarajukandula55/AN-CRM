/**
 * Goods Receipt (GRN) service — the ONE real implementation, replacing
 * three that used to coexist:
 *   1. models/GRN.ts + grn.service.ts + api/grn/* — deprecated model, no
 *      frontend, and createGRN() never touched inventory stock at all.
 *   2. models/GoodsReceipt.js + GoodsReceiptItem.js — the correct,
 *      properly-scoped model (per-business grnNumber, real vendor/
 *      warehouse refs) but had ZERO write path anywhere — nothing ever
 *      created one.
 *   3. api/inventory/grn/route.ts — the only path that actually updated
 *      real inventory numbers, but via raw InventoryMovement rows with an
 *      invalid referenceType ("GRN" isn't in InventoryTransaction's real
 *      enum) and no GoodsReceipt document at all -- not printable, not
 *      listable, and its own PO status update ("COMPLETED") isn't even a
 *      valid PurchaseOrder.status value.
 * All three were confirmed empty in production (zero real GRN data
 * anywhere) before consolidating, so this is a clean rebuild, not a
 * migration.
 *
 * PurchaseOrderItem already had receivedQuantity/acceptedQuantity/
 * rejectedQuantity/pendingQuantity fields, and PurchaseOrder.status already
 * had PARTIAL_RECEIVED/RECEIVED values -- clearly designed for exactly
 * this receiving workflow, just never wired up until now.
 */

import { Types } from "mongoose";
import GoodsReceipt from "@/models/GoodsReceipt";
import GoodsReceiptItem from "@/models/GoodsReceiptItem";
import PurchaseOrder from "@/models/PurchaseOrder";
import PurchaseOrderItem from "@/models/PurchaseOrderItem";
import InventoryItem from "@/models/InventoryItem";
import InventoryTransaction from "@/models/InventoryTransaction";
import { generateDocumentNumber } from "@/core/numbering/numberingService";
// Required for .populate("materialId") below -- the model must be
// registered before populate can resolve it by ref name.
import "@/models/Material";
import "@/models/VendorProfile";
import "@/models/Warehouse";

export interface ReceiveLineInput {
  purchaseOrderItemId: string;
  receivedQuantity: number;
  acceptedQuantity?: number;
  rejectedQuantity?: number;
  remarks?: string;
}

/**
 * Records receipt of goods against an APPROVED (or already
 * PARTIAL_RECEIVED) purchase order: creates the GoodsReceipt document +
 * line items, updates each PurchaseOrderItem's received/accepted/rejected/
 * pending quantities, posts an inventory-IN transaction per line and bumps
 * real stock (accepted quantity only -- rejected goods never enter
 * sellable inventory), and rolls the PO's own status forward to
 * PARTIAL_RECEIVED or RECEIVED depending on whether every line is now
 * fully received.
 */
export async function createGoodsReceipt(input: {
  businessId: string;
  purchaseOrderId: string;
  lines: ReceiveLineInput[];
  invoiceNumber?: string;
  invoiceDate?: Date;
  remarks?: string;
  createdBy: string;
}) {
  const po = await PurchaseOrder.findOne({
    _id: input.purchaseOrderId,
    businessId: input.businessId,
  });
  if (!po) throw new Error("Purchase order not found");
  if (!["APPROVED", "PARTIAL_RECEIVED"].includes(po.status)) {
    throw new Error(`Cannot receive goods against a purchase order in "${po.status}" status`);
  }

  const poItems = await PurchaseOrderItem.find({ purchaseOrderId: po._id }).populate("materialId");
  const poItemsById = new Map(poItems.map((it: any) => [String(it._id), it]));

  const { value: grnNumber } = await generateDocumentNumber(input.businessId, "GRN");

  const goodsReceipt = await GoodsReceipt.create({
    businessId: input.businessId,
    vendorId: po.vendorId,
    warehouseId: po.warehouseId,
    grnNumber,
    purchaseOrderId: po._id,
    invoiceNumber: input.invoiceNumber,
    invoiceDate: input.invoiceDate,
    remarks: input.remarks,
    createdBy: input.createdBy,
    status: "POSTED",
  });

  let totalReceivedQty = 0;
  let totalAcceptedQty = 0;
  let totalRejectedQty = 0;
  let totalValue = 0;

  for (const line of input.lines) {
    const poItem: any = poItemsById.get(line.purchaseOrderItemId);
    if (!poItem) continue;

    const received = line.receivedQuantity || 0;
    const accepted = line.acceptedQuantity ?? received;
    const rejected = line.rejectedQuantity ?? Math.max(0, received - accepted);
    const unitRate = poItem.unitPrice || 0;
    const lineTotal = accepted * unitRate;

    await GoodsReceiptItem.create({
      goodsReceiptId: goodsReceipt._id,
      materialId: poItem.materialId?._id || poItem.materialId,
      materialCode: poItem.materialCode,
      materialName: poItem.materialName || poItem.materialId?.name,
      unit: poItem.unit,
      orderedQuantity: poItem.orderedQuantity,
      receivedQuantity: received,
      acceptedQuantity: accepted,
      rejectedQuantity: rejected,
      unitRate,
      lineTotal,
      remarks: line.remarks,
    });

    // Roll this receipt's quantities into the PO line's running totals
    // (a PO can be received across several partial GRNs).
    poItem.receivedQuantity = (poItem.receivedQuantity || 0) + received;
    poItem.acceptedQuantity = (poItem.acceptedQuantity || 0) + accepted;
    poItem.rejectedQuantity = (poItem.rejectedQuantity || 0) + rejected;
    poItem.pendingQuantity = Math.max(0, poItem.orderedQuantity - poItem.receivedQuantity);
    await poItem.save();

    if (accepted > 0) {
      const materialId = poItem.materialId?._id || poItem.materialId;
      const inventory = await InventoryItem.findOneAndUpdate(
        { businessId: input.businessId, warehouseId: po.warehouseId, materialId },
        { $inc: { onHandQuantity: accepted, availableQuantity: accepted } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      await InventoryTransaction.create({
        businessId: input.businessId,
        warehouseId: po.warehouseId,
        itemType: "MATERIAL",
        materialId,
        itemName: poItem.materialName || poItem.materialId?.name,
        unit: poItem.unit,
        transactionType: "GRN",
        quantity: accepted,
        runningQuantity: inventory?.onHandQuantity ?? accepted,
        unitCost: unitRate,
        totalCost: lineTotal,
        movementReason: "PURCHASE",
        referenceType: "GOODS_RECEIPT",
        referenceId: goodsReceipt._id,
        referenceNumber: grnNumber,
      });
    }

    totalReceivedQty += received;
    totalAcceptedQty += accepted;
    totalRejectedQty += rejected;
    totalValue += lineTotal;
  }

  goodsReceipt.totalItems = input.lines.length;
  goodsReceipt.totalReceivedQty = totalReceivedQty;
  goodsReceipt.totalAcceptedQty = totalAcceptedQty;
  goodsReceipt.totalRejectedQty = totalRejectedQty;
  goodsReceipt.totalValue = totalValue;
  await goodsReceipt.save();

  // Roll the PO's own status forward -- fully received once every line's
  // pendingQuantity has hit zero, partially received otherwise.
  const freshPoItems = await PurchaseOrderItem.find({ purchaseOrderId: po._id });
  const fullyReceived = freshPoItems.every((it: any) => (it.pendingQuantity ?? it.orderedQuantity) <= 0);
  po.status = fullyReceived ? "RECEIVED" : "PARTIAL_RECEIVED";
  await po.save();

  return goodsReceipt;
}

export async function getGoodsReceiptById(id: string) {
  const receipt = await GoodsReceipt.findById(id)
    .populate("vendorId")
    .populate("warehouseId")
    .populate("purchaseOrderId")
    .lean();
  if (!receipt) return null;

  const items = await GoodsReceiptItem.find({ goodsReceiptId: id }).populate("materialId").lean();
  return { ...(receipt as any), items };
}

export async function listGoodsReceiptsByBusiness(
  businessId: string,
  opts: { page?: number; limit?: number; vendorId?: string } = {}
) {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, Math.max(1, opts.limit || 25));

  const query: Record<string, unknown> = { businessId: new Types.ObjectId(businessId) };
  // Vendor-scoped view (see app/vendor/grn) -- GoodsReceipt already carries
  // its own vendorId natively, unlike CrmCall/CrmJobSheet, so this is a
  // direct filter rather than an assignedTo-set workaround.
  if (opts.vendorId) query.vendorId = new Types.ObjectId(opts.vendorId);
  const [items, total] = await Promise.all([
    GoodsReceipt.find(query)
      .populate("vendorId", "businessName legalName")
      .populate("warehouseId", "warehouseName")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    GoodsReceipt.countDocuments(query),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}
