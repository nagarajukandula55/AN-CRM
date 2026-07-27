import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import VendorProfile from "@/models/VendorProfile";
import VendorPayoutAccount from "@/models/VendorPayoutAccount";
import { createLinkedAccount } from "@/core/payouts/razorpayRoute";
import { logAction } from "@/lib/audit/logAction";
import { resolveVendorContext } from "@/lib/auth/vendorContext";
import { resolveOwnerOrManagerVendor } from "@/core/access/vendorAccess.service";

/* =========================================================
 * GET /api/vendor/payout-account
 * The logged-in vendor's own Razorpay Route payout account + status.
 * =======================================================*/
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // View access extends to vendor staff too (see lib/auth/vendorContext.ts)
    // — only the actual submission of KYC/bank details below stays
    // owner-only, since that's sensitive enough to restrict to the account
    // the vendor login itself belongs to.
    const ctx = await resolveVendorContext(userId);
    if (!ctx) {
      return NextResponse.json({ success: false, error: "No vendor profile for this user" }, { status: 404 });
    }
    const vendor = ctx.vendor;

    const account = await VendorPayoutAccount.findOne({ vendorId: (vendor as any)._id }).lean();
    return NextResponse.json({ success: true, account: account || null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/* =========================================================
 * POST /api/vendor/payout-account
 * Vendor submits/updates their payout KYC details, which creates (or
 * would update, once implemented — see attachBankAccount's TODO) a
 * Razorpay Route linked account. Starts in CREATED status; Razorpay
 * reviews asynchronously before it becomes ACTIVATED and transfers can
 * actually succeed.
 * =======================================================*/
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Owner or Manager may submit KYC/bank details -- per the vendor's
    // access model, Manager has full Owner-equivalent authority (see
    // resolveOwnerOrManagerVendor's docstring), so this is no longer
    // restricted to the literal VendorProfile.userId account.
    const vendor = await resolveOwnerOrManagerVendor(userId);
    if (!vendor) {
      return NextResponse.json({ success: false, error: "No vendor profile for this user" }, { status: 404 });
    }

    const body = await req.json();
    const {
      legalBusinessName,
      businessType,
      panNumber,
      gstNumber,
      bankAccountNumber,
      bankIfsc,
      bankBeneficiaryName,
      contactEmail,
      contactPhone,
    } = body;

    if (!legalBusinessName || !bankAccountNumber || !bankIfsc || !bankBeneficiaryName || !contactEmail || !contactPhone) {
      return NextResponse.json(
        {
          success: false,
          error: "legalBusinessName, bankAccountNumber, bankIfsc, bankBeneficiaryName, contactEmail, and contactPhone are required",
        },
        { status: 400 }
      );
    }

    let existing = await VendorPayoutAccount.findOne({ vendorId: (vendor as any)._id });

    let razorpayAccountId = existing?.razorpayAccountId;
    let status: string = existing?.status || "NOT_STARTED";

    // Only creates the linked account once — resubmitting KYC details
    // updates our own record, but re-creating the Razorpay account isn't
    // attempted here (that would need Razorpay's update-account endpoint,
    // a follow-up beyond this initial build — see razorpayRoute.ts).
    if (!razorpayAccountId) {
      try {
        const created = await createLinkedAccount({
          email: contactEmail,
          phone: contactPhone,
          legalBusinessName,
          businessType: businessType || "individual",
          panNumber,
          gstNumber,
          bankAccountNumber,
          bankIfsc,
          bankBeneficiaryName,
        });
        razorpayAccountId = created.id;
        status = "CREATED";
      } catch (err) {
        return NextResponse.json(
          {
            success: false,
            error:
              err instanceof Error
                ? `Failed to create Razorpay payout account: ${err.message}`
                : "Failed to create Razorpay payout account",
          },
          { status: 502 }
        );
      }
    }

    const update = {
      vendorId: (vendor as any)._id,
      businessId: (vendor as any).businessId,
      razorpayAccountId,
      status,
      legalBusinessName,
      businessType: businessType || "individual",
      panNumber,
      gstNumber,
      bankAccountNumber,
      bankIfsc,
      bankBeneficiaryName,
      contactEmail,
      contactPhone,
      lastSyncedAt: new Date(),
    };

    const account = existing
      ? await VendorPayoutAccount.findByIdAndUpdate(existing._id, update, { new: true })
      : await VendorPayoutAccount.create(update);

    logAction({
      action: existing ? "UPDATE" : "CREATE",
      entity: "VendorPayoutAccount",
      entityId: account?._id?.toString(),
      after: account,
      req,
      actor: { id: userId, businessId: (vendor as any).businessId?.toString() },
    });

    return NextResponse.json({ success: true, account });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
