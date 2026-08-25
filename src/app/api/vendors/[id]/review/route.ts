import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { Types } from "mongoose";
import bcryptjs from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import VendorProfile from "@/models/VendorProfile";
import Business from "@/models/Business";
import Agreement, { ISignature } from "@/models/Agreement";
import { generateGlobalDocumentNumber } from "@/core/numbering/numberingService";
import { logAction } from "@/lib/audit/logAction";
import { sendAgreementOtpEmail, sendGenericEmail } from "@/services/email/resend.service";
import { renderEmailShell } from "@/services/email/emailShell";
import { getCentralAgreementTemplate } from "@/core/agreements/getCentralAgreementTemplate";

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/vendors/[id]/review
 * Body: { action: "APPROVE" | "REJECT", reason?: string }
 *
 * Step 2 of vendor onboarding: admin reviews the application.
 *  - APPROVE → a VENDOR partner agreement is generated (parties: business +
 *    vendor) and the vendor moves to AGREEMENT_DRAFTED. The admin then sends
 *    it for OTP signing from the Agreements screen (existing flow), which is
 *    what actually moves the vendor to AGREEMENT_SENT (see
 *    /api/agreements/[id]/send).
 *  - REJECT  → status REJECTED with a reason.
 */
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await req.json();
    const action = body.action as "APPROVE" | "REJECT";

    const vendor = await VendorProfile.findById(id);
    if (!vendor || vendor.isDeleted) {
      return NextResponse.json({ success: false, error: "Vendor not found" }, { status: 404 });
    }

    if (action === "REJECT") {
      vendor.status = "REJECTED";
      vendor.rejectionReason = body.reason || "Not specified";
      vendor.reviewedBy = userId as any;
      vendor.reviewedAt = new Date();
      await vendor.save();

      // Was never actually sent -- the applicant only ever heard back on
      // approval, never rejection, leaving them with no record their
      // application was even reviewed.
      if (vendor.email) {
        sendGenericEmail({
          to: vendor.email,
          subject: "Update on your partner application",
          html: renderEmailShell({
            heading: "Update on your application",
            previewText: "An update on your partner application.",
            bodyHtml: `
              <p>Hi ${vendor.contactPerson || ""},</p>
              <p>Thanks for your interest in becoming a partner with <strong>${vendor.companyName}</strong>. After review, we're not able to move forward with this application at this time.</p>
              ${vendor.rejectionReason ? `<p style="font-size:13px;color:#8B8F94;">Reason: ${vendor.rejectionReason}</p>` : ""}
            `,
          }),
          businessId: (vendor.businessId as any)?.toString(),
          templateKey: "VENDOR_REJECTED",
          templateTokens: { vendorName: vendor.contactPerson || "", businessName: vendor.companyName || "", reason: vendor.rejectionReason || "" },
        }).catch(() => {});
      }

      logAction({
        action: "REJECT",
        entity: "VendorProfile",
        entityId: id,
        after: vendor,
        req,
        actor: { id: userId },
      });

      return NextResponse.json({ success: true, vendor });
    }

    if (action !== "APPROVE") {
      return NextResponse.json(
        { success: false, error: "action must be APPROVE or REJECT" },
        { status: 400 }
      );
    }

    if (!["APPLIED", "PENDING"].includes(vendor.status)) {
      return NextResponse.json(
        { success: false, error: `Vendor is already ${vendor.status} — review applies to new applications only` },
        { status: 400 }
      );
    }

    // A general (business-agnostic) signup request has no businessId yet —
    // the admin assigns it here, at approval time, via the request body.
    // A link-based application (which pre-selected a business at signup)
    // already has one and doesn't need to supply it again, but a caller
    // MAY still override it here if needed.
    if (!vendor.businessId) {
      const approveBusinessId = body.businessId;
      if (!approveBusinessId || !Types.ObjectId.isValid(approveBusinessId)) {
        return NextResponse.json(
          { success: false, error: "businessId is required to approve a vendor request with no assigned business" },
          { status: 400 }
        );
      }
      const targetBusiness = await (Business as any)
        .findOne({ _id: approveBusinessId, isActive: true })
        .select("_id")
        .lean();
      if (!targetBusiness) {
        return NextResponse.json({ success: false, error: "Business not found or inactive" }, { status: 404 });
      }
      vendor.businessId = new Types.ObjectId(approveBusinessId) as any;
      if (!vendor.vendorId) {
        const { value: vendorId } = await generateGlobalDocumentNumber("VENDOR", approveBusinessId);
        vendor.vendorId = vendorId;
      }
    } else if (body.businessId && String(body.businessId) !== String(vendor.businessId)) {
      const targetBusiness = await (Business as any)
        .findOne({ _id: body.businessId, isActive: true })
        .select("_id")
        .lean();
      if (!targetBusiness) {
        return NextResponse.json({ success: false, error: "Business not found or inactive" }, { status: 404 });
      }
      vendor.businessId = new Types.ObjectId(body.businessId) as any;
    }

    const business = await (Business as any)
      .findById(vendor.businessId)
      .select("name legalName brandName address city state pincode compliance email")
      .lean();

    const businessDisplay = business?.legalName || business?.name || "The Business";
    const vendorDisplay = vendor.companyName;

    /* ── Generate the partner agreement ────────────────────────────── */
    const gstClause = vendor.gstRegistered
      ? "The Vendor is GST-registered and shall raise valid GST-compliant B2B invoices to the Company for all confirmed orders."
      : "The Vendor is not GST-registered; commercial terms shall account for applicable tax treatment under the Company's policies.";
    // An admin can configure a live VENDOR_AGREEMENT body in central-api's
    // Admin > Agreements (globally or assigned to this specific business)
    // -- used verbatim (with these placeholders filled in) instead of the
    // hardcoded template below when one is configured and active for this
    // business. Falls back to the exact previous hardcoded content when
    // nothing is configured, so this is a pure opt-in with zero behavior
    // change for every business that hasn't touched it.
    const centralTemplate = await getCentralAgreementTemplate("VENDOR_AGREEMENT", vendor.businessId?.toString(), {
      businessDisplay,
      vendorDisplay,
      businessGstin: business?.compliance?.gstNumber || "",
      businessAddress: [business?.address, business?.city, business?.state, business?.pincode].filter(Boolean).join(", ") || "its registered address",
      vendorGstinOrPan: vendor.gstRegistered && vendor.gstNumber ? `GSTIN: ${vendor.gstNumber}` : vendor.panNumber ? `PAN: ${vendor.panNumber}` : "",
      vendorAddress: [vendor.address?.street, vendor.address?.city, vendor.address?.state, vendor.address?.pincode].filter(Boolean).join(", ") || "its registered address",
      gstClause,
      paymentTerms: vendor.paymentTerms || "30 days",
    });
    const content = centralTemplate || `VENDOR PARTNER AGREEMENT

This Vendor Partner Agreement ("Agreement") is entered into between:

1. ${businessDisplay}${business?.compliance?.gstNumber ? ` (GSTIN: ${business.compliance.gstNumber})` : ""}, having its registered office at ${[business?.address, business?.city, business?.state, business?.pincode].filter(Boolean).join(", ") || "its registered address"} ("the Company"), and

2. ${vendorDisplay}${vendor.gstRegistered && vendor.gstNumber ? ` (GSTIN: ${vendor.gstNumber})` : vendor.panNumber ? ` (PAN: ${vendor.panNumber})` : ""}, having its registered office at ${[vendor.address?.street, vendor.address?.city, vendor.address?.state, vendor.address?.pincode].filter(Boolean).join(", ") || "its registered address"} ("the Vendor").

1. SCOPE — The Vendor shall supply products/services to the Company and may list approved products on the Company's sales channels. All product listings are subject to the Company's review and approval.

2. ORDERS & FULFILMENT — Orders received on the Company's channels will be shared with the Vendor for confirmation. On confirmation, a purchase (B2B) transaction is raised from the Vendor to the Company, and the Company invoices the end customer directly.

3. INVOICING & TAX — ${vendor.gstRegistered ? "The Vendor is GST-registered and shall raise valid GST-compliant B2B invoices to the Company for all confirmed orders." : "The Vendor is not GST-registered; commercial terms shall account for applicable tax treatment under the Company's policies."}

4. PAYMENTS — The Company shall settle Vendor invoices per the agreed payment terms (${vendor.paymentTerms || "30 days"}).

5. QUALITY & COMPLIANCE — The Vendor warrants that all supplied products meet applicable quality, safety and labelling standards.

6. TERM & TERMINATION — Either party may terminate with 30 days' written notice. Confirmed orders survive termination.

7. GOVERNING LAW — This Agreement is governed by the laws of India.

By signing below, both parties agree to the terms above.`;

    const agreement = await (Agreement as any).create({
      businessId: vendor.businessId,
      createdBy: userId,
      title: `Vendor Partner Agreement — ${vendorDisplay}`,
      type: "VENDOR",
      content,
      parties: [
        {
          name: businessDisplay,
          email: business?.email || undefined,
          role: "Company",
        },
        {
          name: vendor.contactPerson || vendorDisplay,
          email: vendor.email,
          role: "Vendor",
        },
      ],
      signatures: [],
      status: "DRAFT",
    });

    // Per explicit direction: the agreement goes out for signing
    // IMMEDIATELY on approval, not as a separate manual "hit Send" step —
    // OTP-emailed to the Vendor party only (not "Company"; the Super
    // Admin/Owner countersigns in-app later, see
    // api/agreements/[id]/countersign/route.ts, which is why the Company
    // party never gets an OTP here). Same OTP-hash-and-store mechanism as
    // api/agreements/[id]/send/route.ts, just scoped to one party.
    const vendorParty = agreement.parties.find((p: any) => p.role === "Vendor");
    if (vendorParty?.email) {
      const rawOtp = generateOtp();
      const hashedOtp = await bcryptjs.hash(rawOtp, 10);
      const otpExpiry = new Date(Date.now() + 30 * 60 * 1000);

      agreement.signatures.push({
        partyEmail: vendorParty.email,
        partyName: vendorParty.name,
        partyRole: "Vendor",
        otpVerified: false,
        otp: hashedOtp,
        otpExpiry,
      } as ISignature);
      agreement.status = "PENDING_SIGNATURE";
      await agreement.save();

      // Same localhost-fallback bug as reset-password/request/route.ts --
      // fall back to the request's own origin instead of hardcoding
      // localhost when NEXT_PUBLIC_APP_URL isn't set.
      const requestOrigin = `${req.headers.get("x-forwarded-proto") || "https"}://${req.headers.get("host") || ""}`;
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || requestOrigin || "http://localhost:3000";
      const signingLink = `${baseUrl}/agreements/${agreement._id}/sign?email=${encodeURIComponent(vendorParty.email)}`;
      sendAgreementOtpEmail({
        to: vendorParty.email,
        partyName: vendorParty.name,
        agreementTitle: agreement.title,
        otp: rawOtp,
        signingLink,
        businessId: (vendor.businessId as any)?.toString(),
      }).catch(() => {});

      // Separate "you've been approved" notice, sent right away — distinct
      // from the OTP email above (which asks for a signature, not just
      // informs), per explicit direction that approval itself should be
      // communicated immediately.
      sendGenericEmail({
        to: vendorParty.email,
        subject: "Your application has been approved",
        html: renderEmailShell({
          heading: "Your application has been approved",
          previewText: `Good news from ${businessDisplay} — you're approved.`,
          bodyHtml: `
            <p>Hi ${vendorParty.name || ""},</p>
            <p>Good news — your application with <strong>${businessDisplay}</strong> has been approved. We've sent you a separate email with a link to review and sign your partner agreement.</p>
            <p style="font-size:13px;color:#8B8F94;">Once you've signed, please allow us a little time to countersign and confirm — you'll get a confirmation email as soon as that's done.</p>
          `,
        }),
        businessId: (vendor.businessId as any)?.toString(),
        templateKey: "VENDOR_APPROVED",
        templateTokens: { vendorName: vendorParty.name || "", businessName: businessDisplay, loginUrl: baseUrl },
      }).catch(() => {});
    }

    vendor.status = vendorParty?.email ? "AGREEMENT_SENT" : "AGREEMENT_DRAFTED";
    vendor.agreementId = agreement._id;
    vendor.reviewedBy = userId as any;
    vendor.reviewedAt = new Date();
    await vendor.save();

    logAction({
      action: "APPROVE",
      entity: "VendorProfile",
      entityId: id,
      after: vendor,
      req,
      actor: { id: userId },
    });

    return NextResponse.json({
      success: true,
      vendor,
      agreementId: agreement._id,
      next: vendorParty?.email
        ? "Agreement generated and sent to the vendor for signing. You'll be able to countersign once they've signed."
        : "Agreement generated, but the vendor has no email on file — open it in Agreements to add one and send manually.",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
