/**
 * GET  /api/vendors/[id]/sub-vendors — list sub-vendors under a vendor.
 * POST /api/vendors/[id]/sub-vendors — a vendor creates a sub-vendor under
 *      itself. Per explicit direction ("For every vendor they can create
 *      sub vendors under them and for every sub vendor they add we need to
 *      charge them ... this Activation and their purchase verification
 *      confirmation ... an autonomous system required"):
 *
 *      - A sub-vendor is a full VendorProfile (its own login, its own
 *        vendorId from the SAME global numbering sequence every vendor
 *        uses -- see core/numbering -- not a second-class record).
 *      - Gated on the parent's subVendorBilling.subVendorPlan: "BLOCKED"
 *        refuses outright.
 *      - REQUIRES a verified, unconsumed Subscription addon charge
 *        (subVendorOf = this parent vendor, status ACTIVE, consumedAt
 *        unset) passed as `subscriptionId` in the request body -- see
 *        api/subscriptions/create-order + verify for how that charge gets
 *        created and paid via Razorpay before this call. The charge is
 *        claimed via an atomic findOneAndUpdate() BEFORE user/vendor
 *        creation starts (not just "eventually" marked consumed
 *        afterward) -- MongoDB's single-document find+update is atomic on
 *        its own, so two concurrent requests for the same subscriptionId
 *        can never both win, and the same paid charge can never fund two
 *        sub-vendors. If anything after the claim fails, the charge is
 *        released back to unconsumed in the catch block so the payment
 *        isn't lost and the caller can safely retry.
 */

import { NextRequest, NextResponse } from "next/server";
import bcryptjs from "bcryptjs";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import VendorProfile from "@/models/VendorProfile";
import Subscription from "@/models/Subscription";
import { generateGlobalDocumentNumber } from "@/core/numbering/numberingService";
import { generateUniqueUserId } from "@/lib/auth/generateUserId";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { resolveOwnerOrManagerVendor } from "@/core/access/vendorAccess.service";
import { logAction } from "@/lib/audit/logAction";

async function resolveAndAuthorizeParent(userId: string, parentIdParam: string) {
  if (!mongoose.Types.ObjectId.isValid(parentIdParam)) return null;
  const ownVendor = await resolveOwnerOrManagerVendor(userId);
  if (!ownVendor || (ownVendor as any)._id.toString() !== parentIdParam) return null;
  return VendorProfile.findById(parentIdParam);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid vendor id" }, { status: 400 });
    }

    await connectDB();
    const subVendors = await VendorProfile.find({ parentVendorId: id, isDeleted: { $ne: true } })
      .select("vendorId companyName contactPerson email phone isApproved createdAt")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, subVendors });
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

    const parent = await resolveAndAuthorizeParent(session.user.id, id);
    if (!parent) {
      return NextResponse.json(
        { success: false, message: "You can only create sub-vendors under your own vendor account" },
        { status: 403 }
      );
    }
    if (parent.subVendorBilling?.subVendorPlan === "BLOCKED") {
      return NextResponse.json(
        { success: false, message: "Sub-vendor creation is currently blocked for this account" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { companyName, contactPerson, email, password, phone, gstNumber, panNumber, subscriptionId } = body;

    if (!companyName?.trim() || !contactPerson?.trim() || !email?.trim() || !password) {
      return NextResponse.json(
        { success: false, message: "Company name, contact person, email and password are required" },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json({ success: false, message: "Password must be at least 8 characters" }, { status: 400 });
    }

    // Require a verified, unconsumed payment before this sub-vendor can be
    // created -- see this file's top comment.
    if (!subscriptionId || !mongoose.Types.ObjectId.isValid(subscriptionId)) {
      return NextResponse.json(
        { success: false, message: "A verified payment (subscriptionId) is required to add a sub-vendor" },
        { status: 402 }
      );
    }

    // Checked BEFORE claiming the charge below -- no reason to consume a
    // payment for a request that's going to fail this validation anyway.
    // (A second user with the same email racing in between this check and
    // the actual User.create() below is still caught by the duplicate-key
    // handling in the outer catch, which runs after the charge has already
    // been released by the inner catch's cleanup.)
    const existing = await User.findOne({ email: email.toLowerCase().trim(), isDeleted: false });
    if (existing) {
      return NextResponse.json({ success: false, message: "An account with this email already exists" }, { status: 409 });
    }

    // Claim the charge ATOMICALLY, before doing anything else -- was
    // previously a plain findOne() here, with the actual consumedAt write
    // deferred until after user/vendor creation succeeded. Two concurrent
    // requests for the same subscriptionId (a double-click, or a client
    // retry after a slow-but-successful response) could both pass that
    // findOne() before either one set consumedAt, creating TWO sub-vendors
    // from ONE paid charge. findOneAndUpdate's match+set happens as a
    // single atomic operation at the database level, so only one
    // concurrent caller can ever win this -- the loser gets a normal
    // "already used" 402, not a duplicate vendor.
    //
    // Claimed here (before user/vendor creation, not after) rather than
    // matching the exact original ordering, so the charge can never be
    // consumed by two racing requests even if the rest of the flow below
    // takes a while. If anything after this point fails, the catch block
    // reverts consumedAt back to null so the payment isn't lost.
    const charge = await Subscription.findOneAndUpdate(
      {
        _id: subscriptionId,
        subVendorOf: parent._id,
        status: "ACTIVE",
        consumedAt: null,
      },
      { $set: { consumedAt: new Date() } },
      { new: true }
    );
    if (!charge) {
      return NextResponse.json(
        { success: false, message: "No verified, unused payment found for this sub-vendor addition" },
        { status: 402 }
      );
    }

    try {
      const hashedPassword = await bcryptjs.hash(password, 12);
      const user = await User.create({
        name: contactPerson.trim(),
        email: email.toLowerCase().trim(),
        username: await generateUniqueUserId(),
        password: hashedPassword,
        phone: phone?.trim() || undefined,
        role: "VENDOR",
        isActive: true, // sub-vendor created by an already-approved parent, no separate approval queue
        isEmailVerified: false,
        authProvider: "credentials",
      });

      const { value: vendorId } = await generateGlobalDocumentNumber("VENDOR", String(parent.businessId));

      const subVendor = await VendorProfile.create({
        userId: user._id,
        businessId: parent.businessId,
        parentVendorId: parent._id,
        vendorId,
        companyName: companyName.trim(),
        contactPerson: contactPerson.trim(),
        email: email.toLowerCase().trim(),
        phone: phone?.trim() || undefined,
        gstNumber: gstNumber?.toUpperCase().trim() || undefined,
        panNumber: panNumber?.toUpperCase().trim() || undefined,
        isApproved: true,
      });

      parent.subVendorBilling = parent.subVendorBilling || ({} as any);
      parent.subVendorBilling!.subVendorCount = (parent.subVendorBilling?.subVendorCount || 0) + 1;
      parent.subVendorBilling!.lastChargedAt = new Date();
      await parent.save();

      logAction({
        action: "CREATE",
        entity: "VendorProfile",
        entityId: subVendor._id.toString(),
        after: { vendorId: subVendor.vendorId, companyName: subVendor.companyName, parentVendorId: parent._id.toString() },
        req,
        actor: { businessId: parent.businessId?.toString() },
      });

      return NextResponse.json(
        { success: true, message: "Sub-vendor created", vendorId: subVendor.vendorId, subVendor },
        { status: 201 }
      );
    } catch (err) {
      // The charge was already claimed above. If we got here, no
      // sub-vendor was successfully created (or user creation raced past
      // the email-dedup check and hit the unique-index error handled
      // below) -- release the charge back to unconsumed so the customer
      // isn't left having paid for nothing, and so they can safely retry
      // with the same subscriptionId. Best-effort: if THIS write also
      // fails, the charge stays claimed with no vendor created, and needs
      // manual reconciliation -- logged loudly so that's actually visible
      // instead of silently lost.
      await Subscription.findByIdAndUpdate(charge._id, { $set: { consumedAt: null } }).catch((revertErr) => {
        console.error(
          `[sub-vendors] CRITICAL: failed to release charge ${charge._id} after a failed sub-vendor creation -- manual reconciliation needed.`,
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
