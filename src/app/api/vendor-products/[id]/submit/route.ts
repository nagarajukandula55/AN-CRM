import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import VendorProductBOM from "@/models/VendorProductBOM";
import VendorProduct from "@/models/VendorProduct";
import { generateDocumentNumber } from "@/core/numbering/numberingService";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

export async function POST(req: Request, context: any) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("vendor_products", "edit"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    await connectDB();

    const vendorProduct = await VendorProduct.findById(
      (await context.params).id
    );

    if (!vendorProduct) {
      return NextResponse.json(
        { success: false, message: "Not found" },
        { status: 404 }
      );
    }

    /* =========================================================
       🚨 BLOCK IF ALREADY SUBMITTED OR LOCKED
    ========================================================= */
    if (vendorProduct.approvalStatus !== "DRAFT") {
      return NextResponse.json(
        {
          success: false,
          message: "Product already submitted or locked",
        },
        { status: 400 }
      );
    }

    /* =========================================================
       🚨 BOM VALIDATION
    ========================================================= */
    const bomCount = await VendorProductBOM.countDocuments({
      vendorProductId: vendorProduct._id,
      active: true,
    });

    if (bomCount === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Please add BOM before submitting product",
        },
        { status: 400 }
      );
    }

    /* =========================================================
       🧠 SNAPSHOT COST LOCK (FREEZE PRICING STATE)
    ========================================================= */
    const snapshot = {
      totalCost: vendorProduct.calculatedCost?.finalCost || 0,
      baseCost: vendorProduct.calculatedCost?.baseCost || 0,
      shippingCost: vendorProduct.calculatedCost?.shippingCost || 0,
      wastageCost: vendorProduct.calculatedCost?.wastageCost || 0,
    };

    /* =========================================================
       🔒 UPDATE STATE (SUBMIT FOR APPROVAL)
    ========================================================= */
    vendorProduct.approvalStatus = "PENDING";
    vendorProduct.submittedAt = new Date();

    // CRITICAL: freeze editing
    vendorProduct.priceFrozen = true;

    // lock snapshot for audit + admin view
    vendorProduct.priceSnapshot = snapshot;

    // Auto-generate the internal SKU via the canonical numbering engine
    // (same engine every other document type in the system uses) rather
    // than any ad-hoc scheme, and only once — resubmission after a
    // NEEDS_REVISION cycle should keep the SKU it was already assigned.
    if (!vendorProduct.internalSku && vendorProduct.businessId) {
      try {
        const { value } = await generateDocumentNumber(
          vendorProduct.businessId.toString(),
          "PRODUCT"
        );
        vendorProduct.internalSku = value;
      } catch (skuErr) {
        console.error("[vendor-products/submit] SKU generation failed:", skuErr);
        // Non-fatal — submission still proceeds without a pre-assigned SKU;
        // admin approval flow can assign one if this ever happens.
      }
    }

    await vendorProduct.save();

    logAction({
      action: "SUBMIT",
      entity: "VendorProduct",
      entityId: vendorProduct._id.toString(),
      after: {
        status: vendorProduct.approvalStatus,
        internalSku: vendorProduct.internalSku,
      },
      req,
      actor: { businessId: vendorProduct.businessId?.toString() },
    });

    return NextResponse.json({
      success: true,
      message: "Product submitted for approval",
      data: {
        id: vendorProduct._id,
        status: vendorProduct.approvalStatus,
        priceFrozen: vendorProduct.priceFrozen,
        internalSku: vendorProduct.internalSku,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message },
      { status: 500 }
    );
  }
}
