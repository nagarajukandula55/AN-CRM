import { NextRequest, NextResponse } from "next/server";
import bcryptjs from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import VendorProfile from "@/models/VendorProfile";
import { generateUniqueUserId } from "@/lib/auth/generateUserId";
import { notifySuperAdmins } from "@/services/notification.service";
import { logAction } from "@/lib/audit/logAction";

/**
 * POST /api/vendors/self-signup — PUBLIC, ONE-STEP vendor signup.
 *
 * Replaces the old two-step flow (/register for a User account, then
 * /vendor-apply with that account's userId, plus mandatory GST/PAN and a
 * compliance-document checklist) -- per explicit direction: a prospective
 * vendor should be able to sign up with just their email and a few minimal
 * details, not be sent to create a separate account first, and no
 * documents should be collected at signup. Creates the User AND the
 * VendorProfile (status APPLIED, unapproved) in a single call; GST/PAN/
 * bank/compliance docs are all still supported fields on VendorProfile for
 * later (an admin can add them during review), just never required here.
 */
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();
    const { name, companyName, email, phone, password, appliedAs } = body;

    if (!name?.trim() || !companyName?.trim() || !email?.trim() || !password) {
      return NextResponse.json(
        { success: false, message: "Name, company name, email, and password are required" },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json({ success: false, message: "Password must be at least 8 characters" }, { status: 400 });
    }
    if (appliedAs && !["BRAND", "SC", "POS"].includes(appliedAs)) {
      return NextResponse.json({ success: false, message: "Invalid business type" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail, isDeleted: { $ne: true } });
    if (existing) {
      return NextResponse.json(
        { success: false, message: "An account with this email already exists. Try logging in instead." },
        { status: 409 }
      );
    }

    const hashedPassword = await bcryptjs.hash(password, 12);
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      username: await generateUniqueUserId(),
      password: hashedPassword,
      phone: phone?.trim() || undefined,
      role: "VENDOR",
      isActive: true,
      isEmailVerified: false,
      authProvider: "credentials",
    });

    const vendor = await VendorProfile.create({
      userId: user._id,
      companyName: companyName.trim(),
      contactPerson: name.trim(),
      email: normalizedEmail,
      phone: phone?.trim() || undefined,
      appliedAs: appliedAs || undefined,
      status: "APPLIED",
      isApproved: false,
    });

    logAction({
      action: "CREATE",
      entity: "VendorProfile",
      entityId: vendor._id.toString(),
      after: { companyName: vendor.companyName, appliedAs: vendor.appliedAs },
      req,
      actor: { id: user._id.toString() },
    });

    notifySuperAdmins({
      title: "New vendor signup",
      message: `${companyName.trim()} (${appliedAs || "type not set"}) signed up and is awaiting approval.`,
      link: "/console/vendors",
    }).catch(() => {});

    return NextResponse.json(
      { success: true, message: "Signup received — we'll review and activate your account shortly.", vendorId: vendor._id },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
