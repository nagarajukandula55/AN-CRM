import mongoose from "mongoose";

import Business from "@/models/Business";
import PurchaseOrder from "@/models/PurchaseOrder";
import PurchaseOrderItem from "@/models/PurchaseOrderItem";
// Was models/Vendor (legacy, superseded model -- see PurchaseOrder.js's
// schema comment). /api/vendors (what the PO form's vendor dropdown
// actually calls) returns VendorProfile records, so a Vendor.findById
// lookup here against a VendorProfile _id always failed with
// "Vendor not found", regardless of which vendor was selected.
import VendorProfile from "@/models/VendorProfile";
import Material from "@/models/Material";

import {
  generatePurchaseOrderNumber,
} from "@/services/numbering.service";

/**
 * REMOVED: a private, unused `generatePONumber() { return "PO-" + Date.now() }`
 * used to live here — dead code (createPurchaseOrder below already calls
 * the real generatePurchaseOrderNumber() import above), but left in place
 * long enough to look like a second, competing implementation. Deleted as
 * part of the numbering consolidation (see core/numbering/types.ts) so
 * nobody accidentally starts calling it later.
 */

/* ================= CREATE PO ================= */
export async function createPurchaseOrder(payload: any) {
  const session = await mongoose.startSession();

  session.startTransaction();

  try {
    const {
      businessId,
      vendorId,
      warehouseId,
      items,
      expectedDate,
      remarks,
      createdBy,
    } = payload;

    if (!businessId)
      throw new Error("Business required");

    if (!vendorId)
      throw new Error("Vendor required");

    if (!warehouseId)
      throw new Error("Warehouse required");

    if (!items?.length)
      throw new Error("Items required");

    const business = await Business.findById(
      businessId
    );

    if (!business)
      throw new Error("Business not found");

    const vendor = await VendorProfile.findById(
      vendorId
    );

    if (!vendor)
      throw new Error("Vendor not found");

    const poNumber =
      await generatePurchaseOrderNumber(
        business
      );

    let subtotal = 0;
    let taxAmount = 0;
    let discountAmount = 0;

    const po = await PurchaseOrder.create(
      [
        {
          businessId,
          poNumber,
          vendorId,
          warehouseId,
          expectedDate,
          remarks,
          status: "DRAFT",
          subtotal: 0,
          taxAmount: 0,
          discountAmount: 0,
          totalAmount: 0,
          createdBy,
        },
      ],
      { session }
    );

    const purchaseOrder = po[0];

    for (const row of items) {
      const material =
        await Material.findById(
          row.materialId
        );

      if (!material)
        throw new Error(
          "Material not found"
        );

      const qty = Number(row.quantity);

      const rate = Number(row.rate);

      const discount = Number(
        row.discountPercent || 0
      );

      const tax = Number(
        row.taxPercent || 0
      );

      const gross = qty * rate;

      const discountValue =
        (gross * discount) / 100;

      const taxable =
        gross - discountValue;

      const taxValue =
        (taxable * tax) / 100;

      const amount =
        taxable + taxValue;

      subtotal += gross;
      taxAmount += taxValue;
      discountAmount += discountValue;

      await PurchaseOrderItem.create(
        [
          {
            purchaseOrderId:
              purchaseOrder._id,

            materialId:
              material._id,

            quantity: qty,

            pendingQty: qty,

            receivedQty: 0,

            unit:
              row.unit ||
              material.unit,

            rate,

            taxPercent: tax,

            discountPercent:
              discount,

            amount,
          },
        ],
        { session }
      );
    }

    purchaseOrder.subtotal =
      subtotal;

    purchaseOrder.taxAmount =
      taxAmount;

    purchaseOrder.discountAmount =
      discountAmount;

    purchaseOrder.totalAmount =
      subtotal -
      discountAmount +
      taxAmount;

    await purchaseOrder.save({
      session,
    });

    await session.commitTransaction();

    return purchaseOrder;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

/* ================= GET ALL PO ================= */
// Was PurchaseOrder.find() with no filter at all -- every business's
// purchase orders were returned to every caller, a cross-tenant data leak
// on top of the route itself having no auth check (fixed in the route).
export async function getAllPurchaseOrders(businessId: string, vendorId?: string) {
  // Vendor-scoped view (see app/vendor/purchase) -- PurchaseOrder already
  // carries its own vendorId natively.
  const filter: Record<string, unknown> = { businessId };
  if (vendorId) filter.vendorId = vendorId;
  const orders = (await PurchaseOrder.find(filter)
    .populate("vendorId")
    .populate("warehouseId")
    .sort({ createdAt: -1 })
    .lean()) as any[];

  const result = await Promise.all(
    orders.map(async (po) => {
      const items = await PurchaseOrderItem.find({
        purchaseOrderId: po._id,
      }).populate("materialId");

      return {
        ...po,
        items,
      };
    })
  );

  return result;
}

/* ================= GET SINGLE PO ================= */
export async function getPurchaseOrderById(
  id: string
) {
  const po = (await PurchaseOrder.findById(id)
    .populate("vendorId")
    .populate("warehouseId")
    .lean()) as any;

  if (!po) {
    throw new Error(
      "Purchase Order not found"
    );
  }

  const items =
    await PurchaseOrderItem.find({
      purchaseOrderId: po._id,
    }).populate("materialId");

  return {
    ...po,
    items,
  };
}

/* ================= UPDATE PO ================= */
export async function updatePurchaseOrder(
  id: string,
  payload: any
) {
  const po: any =
    await PurchaseOrder.findById(id);

  if (!po) {
    throw new Error(
      "Purchase Order not found"
    );
  }

  if (po.status !== "DRAFT") {
    throw new Error(
      "Only Draft Purchase Orders can be updated."
    );
  }

  const {
    expectedDate,
    remarks,
  } = payload;

  if (expectedDate !== undefined) {
    po.expectedDate = expectedDate;
  }

  if (remarks !== undefined) {
    po.remarks = remarks;
  }

  await po.save();

  return po;
}

/* ================= APPROVE PO ================= */
export async function approvePurchaseOrder({
  id,
  action,
  userId,
}: {
  id: string;
  action: "APPROVE" | "REJECT" | "REVISION";
  userId: string;
}) {
  const po: any =
    await PurchaseOrder.findById(id);

  if (!po) {
    throw new Error(
      "Purchase Order not found"
    );
  }

  if (po.status !== "DRAFT") {
    throw new Error(
      "Only Draft Purchase Orders can be approved."
    );
  }

  switch (action) {
    case "APPROVE":
      po.status = "APPROVED";
      break;

    case "REJECT":
      po.status = "REJECTED";
      break;

    case "REVISION":
      po.status = "REVISION_REQUIRED";
      break;
  }

  po.approvedBy = userId;
  po.approvedAt = new Date();

  await po.save();

  return po;
}

/* ================= CANCEL PO ================= */
export async function cancelPurchaseOrder(
  id: string
) {
  const po: any =
    await PurchaseOrder.findById(id);

  if (!po) {
    throw new Error(
      "Purchase Order not found"
    );
  }

  if (po.status === "RECEIVED") {
    throw new Error(
      "Received Purchase Order cannot be cancelled."
    );
  }

  po.status = "CANCELLED";

  await po.save();

  return po;
}

/* ================= SUBMIT PO ================= */
export async function submitPurchaseOrder(
  id: string
) {
  const po: any =
    await PurchaseOrder.findById(id);

  if (!po) {
    throw new Error(
      "Purchase Order not found"
    );
  }

  const itemCount =
    await PurchaseOrderItem.countDocuments({
      purchaseOrderId: po._id,
    });

  if (itemCount === 0) {
    throw new Error(
      "Purchase Order has no items."
    );
  }

  po.status = "APPROVED";

  await po.save();

  return po;
}
