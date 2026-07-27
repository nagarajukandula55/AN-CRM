import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import CreditAccount from "@/models/CreditAccount";
import VendorProduct from "@/models/VendorProduct";
import B2BOrder from "@/models/B2BOrder";
import { getB2BSession } from "@/lib/auth/b2bSession";
import { getProductCostAndTiers } from "@/core/pricing/productCost";
import { recordInvoice, CreditLimitError } from "@/core/credit/creditLedger";
import { generateDocumentNumber } from "@/core/numbering/numberingService";

// GET /api/b2b/orders — the logged-in account's own order history.
export async function GET() {
  try {
    const session = await getB2BSession();
    if (!session) return NextResponse.json({ success: false, message: "Not logged in" }, { status: 401 });

    await connectDB();
    const orders = await B2BOrder.find({ accountId: session.accountId }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ success: true, data: orders });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

/**
 * POST /api/b2b/orders — places an order for the logged-in account.
 * body: { items: [{ productId, quantity }], paymentMode: "CREDIT"|"PAY_ON_DELIVERY" }
 * Every line is priced server-side (never trusts a client-sent price) at
 * this account's own channel tier + that line's own quantity, so MOQ slabs
 * resolve correctly per line. A CREDIT order books a CreditTransaction
 * INVOICE against the account via the same recordInvoice() the vendor's
 * own manual "Record Transaction" action uses, so the credit-limit check
 * and FIFO aging setup are identical either way.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getB2BSession();
    if (!session) return NextResponse.json({ success: false, message: "Not logged in" }, { status: 401 });

    await connectDB();
    const account = await CreditAccount.findById(session.accountId);
    if (!account || account.status !== "ACTIVE") {
      return NextResponse.json({ success: false, message: "Account not active" }, { status: 403 });
    }

    const body = await req.json();
    const items = Array.isArray(body.items) ? body.items : [];
    const paymentMode = body.paymentMode === "CREDIT" ? "CREDIT" : "PAY_ON_DELIVERY";
    if (!items.length) return NextResponse.json({ success: false, message: "Cart is empty" }, { status: 400 });

    const tierKey = account.type === "DISTRIBUTOR" ? "distributor" : "retailer";
    const orderItems = [];
    let totalAmount = 0;

    for (const item of items) {
      const quantity = Number(item.quantity) || 0;
      if (quantity <= 0) continue;

      const product = await VendorProduct.findOne({ _id: item.productId, vendorId: account.vendorId, status: "APPROVED", active: true });
      if (!product) {
        return NextResponse.json({ success: false, message: `Product ${item.productId} not available` }, { status: 400 });
      }
      const moq = product.minimumOrderQty || 1;
      if (quantity < moq) {
        return NextResponse.json({ success: false, message: `${product.productName} has a minimum order quantity of ${moq}` }, { status: 400 });
      }

      const result = await getProductCostAndTiers(String(product._id), { qty: quantity });
      const tier = result?.tiers.find((t) => t.key === tierKey);
      if (!tier || !tier.price) {
        return NextResponse.json({ success: false, message: `${product.productName} has no ${tierKey} price set` }, { status: 400 });
      }

      const lineTotal = Math.round(tier.price * quantity * 100) / 100;
      totalAmount += lineTotal;
      orderItems.push({
        productId: product._id,
        productName: [product.productName, product.variantName].filter(Boolean).join(" "),
        vendorSku: product.vendorSku,
        unit: product.unit,
        quantity,
        unitPrice: tier.price,
        marginPercent: tier.marginPercent,
        lineTotal,
      });
    }

    if (!orderItems.length) return NextResponse.json({ success: false, message: "No valid items in cart" }, { status: 400 });

    const { value: orderNumber } = await generateDocumentNumber(String(account.businessId), "B2B_ORDER");

    let creditTransactionId: string | undefined;
    if (paymentMode === "CREDIT") {
      try {
        const tx = await recordInvoice(account, totalAmount, { referenceOrderId: orderNumber, notes: `B2B order ${orderNumber}` });
        creditTransactionId = String(tx._id);
      } catch (err: any) {
        if (err instanceof CreditLimitError) {
          return NextResponse.json({ success: false, message: err.message }, { status: 400 });
        }
        throw err;
      }
    }

    const order = await B2BOrder.create({
      businessId: account.businessId,
      vendorId: account.vendorId,
      accountId: account._id,
      orderNumber,
      items: orderItems,
      totalAmount,
      paymentMode,
      creditTransactionId,
      status: "PENDING",
      notes: body.notes || undefined,
    });

    return NextResponse.json({ success: true, order });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
