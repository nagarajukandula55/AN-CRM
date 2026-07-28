/**
 * POST /api/subscriptions/create-order — starts a subscription purchase or
 * renewal: creates a Razorpay order and a PENDING_PAYMENT Subscription
 * record, returns what the client needs to open Razorpay Checkout.
 *
 * Body: { plan, billingPeriod, subVendorOf? }
 * subVendorOf (a VendorProfile id) marks this as a sub-vendor addon charge
 * rather than the business's own primary plan -- see api/vendors/[id]/
 * sub-vendors/route.ts, which requires one of these verified before it
 * will actually create the sub-vendor.
 */
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import Subscription from "@/models/Subscription";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { getRazorpayClient } from "@/core/subscriptions/razorpayClient";
import Business from "@/models/Business";
import { findPlan, priceForPeriod, type PlanKey, type BillingPeriod, type OperatingMode } from "@/core/pricing/plans";

export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    if (!session.business?.businessId) {
      return NextResponse.json({ success: false, message: "No active business" }, { status: 400 });
    }

    const body = await req.json();
    const { plan, billingPeriod, subVendorOf } = body as { plan: PlanKey; billingPeriod: BillingPeriod; subVendorOf?: string };

    await connectDB();

    const business = await Business.findById(session.business.businessId).select("operatingMode").lean();
    const mode = (business as any)?.operatingMode as OperatingMode | "" | undefined;
    if (!mode) {
      return NextResponse.json({ success: false, message: "This business has no operating mode set — contact support" }, { status: 400 });
    }

    const planDef = findPlan(mode, plan);
    if (!planDef) {
      return NextResponse.json({ success: false, message: "Unknown plan for this business's operating mode" }, { status: 400 });
    }
    const { total } = priceForPeriod(planDef, billingPeriod);
    if (!total || total <= 0) {
      return NextResponse.json({ success: false, message: "Invalid amount" }, { status: 400 });
    }

    const razorpay = getRazorpayClient();
    const razorpayOrder = await razorpay.orders.create({
      amount: total * 100, // paise
      currency: "INR",
      receipt: `sub_${Date.now()}`,
      notes: { plan, billingPeriod, businessId: session.business.businessId, subVendorOf: subVendorOf || "" },
    });

    const subscription = await Subscription.create({
      businessId: new mongoose.Types.ObjectId(session.business.businessId),
      subVendorOf: subVendorOf && mongoose.Types.ObjectId.isValid(subVendorOf) ? new mongoose.Types.ObjectId(subVendorOf) : undefined,
      mode,
      plan,
      billingPeriod,
      status: "PENDING_PAYMENT",
      amount: total,
      razorpayOrderId: razorpayOrder.id,
      createdBy: new mongoose.Types.ObjectId(session.user.id),
    });

    return NextResponse.json({
      success: true,
      subscriptionId: subscription._id.toString(),
      razorpayOrderId: razorpayOrder.id,
      amount: total,
      currency: "INR",
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
