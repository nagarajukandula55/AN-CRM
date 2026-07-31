/**
 * GET  /api/businesses/[id]/sub-accounts — list SC sub-accounts created
 *      under this SC business.
 * POST /api/businesses/[id]/sub-accounts — an SC business's own login
 *      creates ANOTHER SC business under itself. Per explicit direction
 *      ("SC type still they can add another account as SC ... to achtiavte
 *      another SC they have to make the payment for that too"):
 *
 *      - Same shape as api/vendors/[id]/sub-vendors/route.ts (that route's
 *        top comment explains the pattern this mirrors): a full Business
 *        (operatingMode SC, parentBusinessId = this one) with its own
 *        Owner login, gated on a verified, unconsumed Subscription addon
 *        charge (subBusinessOf = this business, mode SC, status ACTIVE,
 *        consumedAt unset), atomically claimed before creation so the same
 *        paid charge can never fund two sub-accounts and a failed create
 *        never burns the payment (released back to unconsumed on error).
 *      - SC has no Owner/Manager role split (a single login IS the
 *        business, per the operating-mode design elsewhere in this repo) --
 *        so authorization here is simply "your active business is this
 *        one, and it's an SC business", not a permission check.
 */

import { NextRequest, NextResponse } from "next/server";
import bcryptjs from "bcryptjs";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Business from "@/models/Business";
import BusinessMember from "@/models/BusinessMember";
import Subscription from "@/models/Subscription";
import { bootstrapBusiness } from "@/services/businessBootstrap.service";
import { generateUniqueUserId } from "@/lib/auth/generateUserId";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { logAction } from "@/lib/audit/logAction";

async function resolveAndAuthorizeParent(session: any, parentIdParam: string) {
  if (!mongoose.Types.ObjectId.isValid(parentIdParam)) return null;
  if (!session.isSuperAdmin && session.business?.businessId !== parentIdParam) return null;
  const parent = await Business.findById(parentIdParam);
  if (!parent || parent.operatingMode !== "SC") return null;
  return parent;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid business id" }, { status: 400 });
    }

    await connectDB();
    const subAccounts = await Business.find({ parentBusinessId: id, isActive: true })
      .select("name businessCode email phone createdAt")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, subAccounts });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;

    await connectDB();

    const parent = await resolveAndAuthorizeParent(session, id);
    if (!parent) {
      return NextResponse.json(
        { success: false, message: "You can only add another SC account under your own SC business" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name, email, password, phone, subscriptionId } = body;

    if (!name?.trim() || !email?.trim() || !password) {
      return NextResponse.json(
        { success: false, message: "Business name, email and password are required" },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json({ success: false, message: "Password must be at least 8 characters" }, { status: 400 });
    }

    if (!subscriptionId || !mongoose.Types.ObjectId.isValid(subscriptionId)) {
      return NextResponse.json(
        { success: false, message: "A verified payment (subscriptionId) is required to add another SC account" },
        { status: 402 }
      );
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim(), isDeleted: false });
    if (existing) {
      return NextResponse.json({ success: false, message: "An account with this email already exists" }, { status: 409 });
    }

    // Atomic claim -- see api/vendors/[id]/sub-vendors/route.ts's top
    // comment for why this has to happen before creation, not after.
    const charge = await Subscription.findOneAndUpdate(
      {
        _id: subscriptionId,
        subBusinessOf: parent._id,
        mode: "SC",
        status: "ACTIVE",
        consumedAt: null,
      },
      { $set: { consumedAt: new Date() } },
      { new: true }
    );
    if (!charge) {
      return NextResponse.json(
        { success: false, message: "No verified, unused payment found for this SC account addition" },
        { status: 402 }
      );
    }

    try {
      const business = await bootstrapBusiness({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone?.trim() || undefined,
        type: parent.type,
        operatingMode: "SC",
        parentBusinessId: parent._id,
      });

      const hashedPassword = await bcryptjs.hash(password, 12);
      const user = await User.create({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        username: await generateUniqueUserId(),
        password: hashedPassword,
        phone: phone?.trim() || undefined,
        role: "ADMIN",
        isActive: true,
        isEmailVerified: false,
        authProvider: "credentials",
      });

      await BusinessMember.create({
        userId: user._id,
        businessId: business._id,
        status: "ACTIVE",
        memberType: "OWNER",
        isDefaultBusiness: true,
      });

      logAction({
        action: "CREATE",
        entity: "Business",
        entityId: business._id?.toString(),
        after: { name: business.name, businessCode: (business as any).businessCode, parentBusinessId: parent._id.toString() },
        req,
        actor: { id: session.user.id, businessId: parent._id.toString() },
      });

      return NextResponse.json(
        { success: true, message: "SC account created", business },
        { status: 201 }
      );
    } catch (err) {
      // Release the claimed charge so a failed create doesn't burn the
      // payment -- same reasoning/logging as sub-vendors' catch block.
      await Subscription.findByIdAndUpdate(charge._id, { $set: { consumedAt: null } }).catch((revertErr) => {
        console.error(
          `[sub-accounts] CRITICAL: failed to release charge ${charge._id} after a failed SC account creation -- manual reconciliation needed.`,
          revertErr
        );
      });
      throw err;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("duplicate key") || message.includes("E11000")) {
      return NextResponse.json({ success: false, message: "An account with this email already exists" }, { status: 409 });
    }
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
