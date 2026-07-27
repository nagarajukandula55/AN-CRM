/**
 * POST /api/appointment-requests — PUBLIC, unauthenticated. Lets a
 * customer on a storefront (e.g. Native) request an on-site/service-center
 * appointment without logging in. Creates a CrmCall (status "NEW", source
 * "Public Appointment Request") in the target business, following the same
 * CrmCall-creation shape as app/api/crm/calls/route.ts's POST — just without
 * a session, since there isn't one.
 *
 * businessId resolution follows the same convention as
 * app/api/newsletter/subscribe/route.ts and app/api/businesses/public/route.ts:
 * the caller (storefront) supplies businessId in the body, and we verify the
 * business actually exists and is active before trusting it — never trust a
 * client-supplied businessId blindly.
 *
 * Vendor routing: if exactly one VendorProfile in this business has the
 * submitted pincode in its servicePincodes list, the matched vendor is
 * notified via lib/notify.ts (CrmCall has no vendor-linkage field, and
 * assignedTo refs a User, not a VendorProfile, so we don't force-fit the
 * match there). Zero or multiple matches still create the CrmCall
 * unassigned — the business's CRM dashboard can triage it manually either
 * way.
 */

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import Business from "@/models/Business";
import CrmCall from "@/models/CrmCall";
import VendorProfile from "@/models/VendorProfile";
import PublicEmailVerification from "@/models/PublicEmailVerification";
import PincodeEntry from "@/models/PincodeEntry";
import { generateDocumentNumber } from "@/core/numbering/numberingService";
import { logAction } from "@/lib/audit/logAction";
import { notify } from "@/lib/notify";
import { captureCustomer } from "@/services/customer.service";
import { DEVICE_CATEGORIES } from "@/core/catalog/deviceCategory";

const PINCODE_REGEX = /^[1-9][0-9]{5}$/;

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const body = await req.json().catch(() => ({}));
    const {
      businessId,
      customerName,
      phone,
      email,
      address,
      pincode,
      subject,
      description,
      deviceCategory,
      brandId,
      deviceModelId,
      preferredDate,
      verificationToken,
    } = body || {};

    // verificationToken is OPTIONAL at this route level -- existing callers
    // (e.g. the Native storefront's own appointment widget) keep working
    // unchanged. The new public /appointment-request page (with its email
    // OTP step, see send-otp/verify-otp routes) always sends one; WHEN a
    // token is provided, it's validated for real -- a request claiming to
    // be verified with a bad/expired/mismatched-email token is rejected
    // rather than silently accepted.
    if (verificationToken) {
      const verification = await PublicEmailVerification.findOne({
        purpose: "APPOINTMENT_REQUEST",
        token: verificationToken,
      });
      const tokenEmail = String(email || "").toLowerCase().trim();
      if (
        !verification ||
        !verification.verified ||
        !verification.tokenExpiresAt ||
        verification.tokenExpiresAt < new Date() ||
        verification.email !== tokenEmail
      ) {
        return NextResponse.json(
          { success: false, message: "Email verification expired or invalid — please verify your email again." },
          { status: 400 }
        );
      }
    }

    if (!businessId || !mongoose.Types.ObjectId.isValid(businessId)) {
      return NextResponse.json(
        { success: false, message: "Invalid businessId" },
        { status: 400 }
      );
    }
    if (!customerName?.trim()) {
      return NextResponse.json(
        { success: false, message: "Name is required" },
        { status: 400 }
      );
    }
    if (!phone?.trim()) {
      return NextResponse.json(
        { success: false, message: "Phone number is required" },
        { status: 400 }
      );
    }
    if (!subject?.trim()) {
      return NextResponse.json(
        { success: false, message: "Please describe the service you need" },
        { status: 400 }
      );
    }
    // Device type/brand/model/preferred-date are all REQUIRED on the new
    // public /appointment-request page (enforced client-side there), but
    // kept optional at this API level rather than hard-rejected -- this
    // exact route may also be called by an external integration (e.g.
    // Native's own storefront appointment widget, per this file's header
    // comment) that predates these fields and doesn't send them; rejecting
    // those requests here would silently break that integration instead of
    // just leaving these fields unset on the resulting CrmCall.
    if (deviceCategory && !(DEVICE_CATEGORIES as readonly string[]).includes(deviceCategory)) {
      return NextResponse.json(
        { success: false, message: "Invalid device type" },
        { status: 400 }
      );
    }
    if (brandId && !mongoose.Types.ObjectId.isValid(brandId)) {
      return NextResponse.json(
        { success: false, message: "Invalid brand" },
        { status: 400 }
      );
    }
    if (deviceModelId && !mongoose.Types.ObjectId.isValid(deviceModelId)) {
      return NextResponse.json(
        { success: false, message: "Invalid device model" },
        { status: 400 }
      );
    }
    const parsedPreferredDate = preferredDate ? new Date(preferredDate) : null;
    if (preferredDate && (!parsedPreferredDate || Number.isNaN(parsedPreferredDate.getTime()))) {
      return NextResponse.json(
        { success: false, message: "Invalid preferred date" },
        { status: 400 }
      );
    }
    const trimmedPincode = String(pincode || "").trim();
    if (trimmedPincode && !PINCODE_REGEX.test(trimmedPincode)) {
      return NextResponse.json(
        { success: false, message: "Invalid pincode" },
        { status: 400 }
      );
    }

    // Never trust a client-supplied businessId blindly — verify it's a real,
    // active business first (same check as businesses/public's GET route).
    const business = await Business.findOne({
      _id: businessId,
      isActive: true,
    })
      .select("_id")
      .lean();
    if (!business) {
      return NextResponse.json(
        { success: false, message: "Business not found" },
        { status: 404 }
      );
    }

    const { value: callNumber } = await generateDocumentNumber(businessId, "CALL");

    const addressParts = [address, trimmedPincode].filter(Boolean).join(", ");

    const call = await CrmCall.create({
      businessId: new mongoose.Types.ObjectId(businessId),
      callNumber,
      customerName: customerName.trim(),
      phone: phone.trim(),
      email: email?.toLowerCase()?.trim(),
      address: addressParts || undefined,
      source: "Public Appointment Request",
      subject: subject.trim(),
      description: description?.trim(),
      deviceCategory: deviceCategory || undefined,
      brandId: brandId ? new mongoose.Types.ObjectId(brandId) : undefined,
      deviceModelId: deviceModelId ? new mongoose.Types.ObjectId(deviceModelId) : undefined,
      // "When can we contact you or visit" -- appointmentDate already
      // exists on CrmCall for this exact purpose (see that field's
      // comment), just never populated by this public flow before.
      appointmentDate: parsedPreferredDate || undefined,
      priority: "MEDIUM",
      status: "NEW",
      tags: trimmedPincode ? [`pincode:${trimmedPincode}`] : [],
      createdBy: null,
    });

    // Vendor routing — best-effort, never blocks the response. Matches on
    // the legacy exact-pincode list (servicePincodes) OR the newer
    // state/city/pincode coverage tree (serviceCoverage.onsite), since a
    // request submitted with just a pincode is always an onsite-style
    // request (no walk-in option on this public form).
    let routedVendorId: string | null = null;
    if (trimmedPincode) {
      try {
        const pincodeEntry = await PincodeEntry.findOne({ pincode: trimmedPincode })
          .select("state city")
          .lean();

        const coverageOr: any[] = [
          { servicePincodes: trimmedPincode },
          { "serviceCoverage.onsite.level": "PINCODE", "serviceCoverage.onsite.pincode": trimmedPincode },
        ];
        if (pincodeEntry) {
          coverageOr.push({
            "serviceCoverage.onsite.level": "CITY",
            "serviceCoverage.onsite.state": (pincodeEntry as any).state,
            "serviceCoverage.onsite.city": (pincodeEntry as any).city,
          });
          coverageOr.push({
            "serviceCoverage.onsite.level": "STATE",
            "serviceCoverage.onsite.state": (pincodeEntry as any).state,
          });
        }

        const matches = await VendorProfile.find({
          businessId: new mongoose.Types.ObjectId(businessId),
          isDeleted: { $ne: true },
          $or: coverageOr,
        })
          .select("_id companyName")
          .lean();

        if (matches.length >= 1) {
          // Tag the call with every matched vendor so each SC's own CRM
          // view can filter to "requests near me" — CrmCall itself has no
          // vendor-linkage field, so we piggyback on the tags array (same
          // approach already used for the pincode tag above).
          const vendorTags = matches.map((m) => `matchedVendor:${(m as any)._id}`);
          await CrmCall.updateOne({ _id: call._id }, { $push: { tags: { $each: vendorTags } } });

          if (matches.length === 1) {
            routedVendorId = String((matches[0] as any)._id);
            await CrmCall.updateOne(
              { _id: call._id },
              { $set: { routedVendorId: new mongoose.Types.ObjectId(routedVendorId) } }
            );
          }

          for (const m of matches) {
            notify({
              event: "NEW_CRM_CALL",
              businessId: String(businessId),
              message: `📅 New appointment request ${call.callNumber} matched to your service area\nCustomer: ${call.customerName}\nPhone: ${call.phone}\nPincode: ${trimmedPincode}\nSubject: ${call.subject}`,
            }).catch(() => {});
          }
        } else {
          // No vendor covers this pincode -- flag it so the Appointments
          // admin view can surface it for a Super Admin to manually assign
          // a vendor (see api/crm/calls/[id]/assign-vendor).
          await CrmCall.updateOne({ _id: call._id }, { $push: { tags: "needsAssignment" } });
        }
      } catch {
        // Routing is best-effort — request already succeeded above.
      }
    } else {
      // No pincode submitted at all -- can't auto-route, flag for manual
      // assignment same as the zero-match case above.
      await CrmCall.updateOne({ _id: call._id }, { $push: { tags: "needsAssignment" } }).catch(() => {});
    }

    notify({
      event: "NEW_CRM_CALL",
      businessId: String(businessId),
      message: `📞 New appointment request ${call.callNumber}\nCustomer: ${call.customerName}\nSubject: ${call.subject}`,
    }).catch(() => {});

    captureCustomer({
      businessId,
      name: call.customerName,
      phone: call.phone,
      email: call.email,
      address: addressParts,
      sourceModule: "APPOINTMENT_REQUEST",
      sourceLabel: "Public Appointment Request",
      vendorId: routedVendorId,
    });

    logAction({
      action: "CREATE",
      entity: "CrmCall",
      entityId: call._id?.toString(),
      after: call,
      req,
      actor: { id: "public", businessId: String(businessId) },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Appointment request submitted successfully",
        referenceNumber: call.callNumber,
        routed: Boolean(routedVendorId),
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("Appointment request POST error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
