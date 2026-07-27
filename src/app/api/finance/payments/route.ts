import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import Payment from "@/models/Payment";
import SalesInvoice from "@/models/SalesInvoice";
import { logAction } from "@/lib/audit/logAction";

/* =========================================================
 * GET PAYMENTS
 * =======================================================*/
export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();

    if (!session?.user || !session.business) {
      return NextResponse.json(
        { error: "Unauthorized or missing business context" },
        { status: 401 }
      );
    }

    requirePermission(session as any, buildPermissionCode("finance", "view"));

    const payments = await Payment.find({
      businessId: new Types.ObjectId(session.business.businessId),
      isDeleted: false,
    }).sort({ createdAt: -1 });

    return NextResponse.json({
      success: true,
      data: payments,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal Server Error",
      },
      { status: 500 }
    );
  }
}

/* =========================================================
 * CREATE PAYMENT FOR INVOICE
 * =======================================================*/
export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();

    if (!session?.user || !session.business) {
      return NextResponse.json(
        { error: "Unauthorized or missing business context" },
        { status: 401 }
      );
    }

    requirePermission(session as any, buildPermissionCode("finance", "create"));

    const body = await req.json();

    const {
      invoiceId,
      amount,
      method, // CASH | BANK | UPI | CARD
      referenceNumber,
      notes,
    } = body;

    if (!invoiceId || !amount) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const businessId = session.business.businessId;

    /**
     * STEP 1: Validate invoice
     */
    const invoice = await SalesInvoice.findOne({
      _id: new Types.ObjectId(invoiceId),
      businessId: new Types.ObjectId(businessId),
      isDeleted: false,
    });

    if (!invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    /**
     * STEP 2: Create payment record
     */
    const payment = await Payment.create({
      businessId: new Types.ObjectId(businessId),
      invoiceId: new Types.ObjectId(invoiceId),
      amount,
      method,
      referenceNumber,
      notes,
      createdBy: session.user.id,
    });

    /**
     * STEP 3: Update invoice payment status
     */
    const totalPaid = await Payment.aggregate([
      {
        $match: {
          invoiceId: new Types.ObjectId(invoiceId),
          businessId: new Types.ObjectId(businessId),
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);

    const paidAmount = totalPaid[0]?.total || 0;

    // SalesInvoice's status enum uses "PARTIAL", not "PARTIALLY_PAID" --
    // was setting a value the schema doesn't allow, which would throw a
    // validation error on invoice.save() every time a partial payment came in.
    if (paidAmount >= invoice.grandTotal) {
      invoice.status = "PAID";
    } else if (paidAmount > 0) {
      invoice.status = "PARTIAL";
    }
    invoice.paidAmount = paidAmount;
    if (invoice.status === "PAID") invoice.paidAt = new Date();

    await invoice.save();

    logAction({
      action: "CREATE",
      entity: "Payment",
      entityId: payment?._id?.toString(),
      after: payment,
      req,
      actor: { id: session.user.id, businessId: businessId?.toString() },
    });

    return NextResponse.json({
      success: true,
      message: "Payment recorded successfully",
      data: payment,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal Server Error",
      },
      { status: 500 }
    );
  }
}
