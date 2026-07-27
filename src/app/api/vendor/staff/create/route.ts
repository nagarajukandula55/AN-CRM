import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import User, { AuthProvider } from "@/models/User";
import BusinessMember, { BusinessMemberStatus, BusinessMemberType } from "@/models/BusinessMember";
import Role from "@/models/Role";
import UserRole from "@/models/UserRole";
import { logAction } from "@/lib/audit/logAction";
import { generateScopedDocumentNumber } from "@/core/numbering/numberingService";
import { grantVendorStaffAccess, MEMBER_TYPE_IMPLIED_MODULES } from "@/core/access/vendorAccess.service";
import { resolveOwnerOrManagerVendor as requireVendorOwnerOrManager } from "@/core/access/vendorAccess.service";

const SALT_ROUNDS = 12;

// Fixed, predictable first password rather than a random one -- per
// explicit direction, every self-service-created employee starts on this
// same default so whoever's onboarding them doesn't need to relay a
// freshly-generated string, and `mustChangePassword: true` below still
// forces them off it the moment they actually log in.
const DEFAULT_FIRST_PASSWORD = "ANgroup@123";

// MEMBER_TYPE_IMPLIED_MODULES is now shared (core/access/vendorAccess.service.ts)
// -- was duplicated here and in api/vendor/staff/route.ts, out of sync
// with each other (this copy had brands/device_models/fault_codes/
// solutions; that one didn't), which is exactly how the Symptom and BOM-
// part dropdowns silently had no options for anyone tagged through the
// OTHER route.

/**
 * POST /api/vendor/staff/create — lets a vendor's Owner/Manager onboard a
 * BRAND NEW person directly, instead of requiring Super Admin to first
 * attach an already-registered platform account (the /api/vendor/staff
 * flow, which only ever looks an existing user up by username). Per
 * explicit direction: vendors manage their own team end-to-end.
 *
 * Creates a real User row so the person can log in, but deliberately:
 *  - never grants any CUSTOMER floor role (register/route.ts's normal
 *    signup path is what does that) -- this account starts with ONLY
 *    whatever vendor-staff access is granted below, nothing storefront-
 *    facing, so it can't casually double as a customer login.
 *  - uses a vendor-scoped login code (`{vendor.vendorId}-{seq}`, e.g.
 *    "VEN-0001-0007") as BOTH the username and the employee code, instead
 *    of letting the vendor pick a username that might collide with an
 *    unrelated existing account -- this is what "add them to the DB with
 *    a Vendor ID-sequence code" and "should not use another system" mean
 *    in practice: the identity is minted fresh and scoped to this vendor,
 *    never reused from/aliased to any pre-existing account.
 *
 * Body: { name: string, email?: string, phone?: string, vendorRole: string,
 *         memberType: string, roleCode?: string }
 */
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    const vendor = await requireVendorOwnerOrManager(userId);
    if (!vendor) {
      return NextResponse.json({ success: false, error: "Only a vendor's Owner or Manager can add its own staff" }, { status: 403 });
    }
    if (!vendor.businessId) {
      return NextResponse.json({ success: false, error: "Vendor is not yet assigned to a business" }, { status: 400 });
    }

    const body = await req.json();
    const { name, email, phone, vendorRole, memberType, roleCode } = body;

    if (!name || !String(name).trim()) {
      return NextResponse.json({ success: false, error: "Name is required" }, { status: 400 });
    }
    if (!vendorRole || !String(vendorRole).trim()) {
      return NextResponse.json({ success: false, error: "A role label is required" }, { status: 400 });
    }

    // Clear, specific conflict messages instead of a raw duplicate-key
    // error -- the vendor is creating someone they believe is brand new,
    // so a generic "already exists" is actively misleading here.
    if (email) {
      const existingEmail = await User.findOne({ email: String(email).toLowerCase().trim(), isDeleted: { $ne: true } }).lean();
      if (existingEmail) {
        return NextResponse.json(
          { success: false, error: "A user with this email already exists on the platform — use Add Staff (by username) instead if this is the same person." },
          { status: 409 }
        );
      }
    }

    // Union of this vendor's own structural roles AND the business's own
    // custom roles (vendorId: null, e.g. CCO/Engineer/Manager created from
    // Admin > Access) -- was vendorId-exact-match only, so a business's
    // own serialized custom roles never showed up here or could be granted
    // to a newly-created employee, only Owner/Manager.
    const roles = await Role.find({
      businessId: vendor.businessId,
      status: "ACTIVE",
      $or: [{ vendorId: vendor._id }, { vendorId: null }],
    }).lean();
    let grantedRoleDoc = null;
    if (roleCode) {
      grantedRoleDoc = roles.find((r: any) => r.code === String(roleCode).toUpperCase());
      if (!grantedRoleDoc) {
        return NextResponse.json(
          { success: false, error: "That role does not belong to your vendor or this business" },
          { status: 400 }
        );
      }
    }

    // Vendor-scoped, human-readable login code: "{vendor.vendorId}-{seq}",
    // sequence resets per-vendor (scopeKey = vendor._id, not businessId or
    // a global counter) so every vendor's numbering starts fresh.
    const { sequence } = await generateScopedDocumentNumber(String(vendor._id), "EMPLOYEE", String(vendor.businessId));
    const employeeCode = `${vendor.vendorId}-${String(sequence).padStart(4, "0")}`;

    const hashedPassword = await bcrypt.hash(DEFAULT_FIRST_PASSWORD, SALT_ROUNDS);

    const newUser = await User.create({
      name: String(name).trim(),
      email: email ? String(email).toLowerCase().trim() : `${employeeCode.toLowerCase()}@staff.local`,
      username: employeeCode.toLowerCase(),
      phone: phone ? String(phone).trim() : undefined,
      password: hashedPassword,
      role: "CUSTOMER",
      isActive: true,
      isEmailVerified: false,
      authProvider: AuthProvider.CREDENTIALS,
      isDeleted: false,
      mustChangePassword: true,
    });

    const ALLOWED_STAFF_MEMBER_TYPES: string[] = ["CCO", "ENGINEER", "CENTRE_MANAGER", "HELPER", "PACKER", "SCM"];
    const isAllowedMemberType =
      memberType && (String(memberType).startsWith("VENDOR") || ALLOWED_STAFF_MEMBER_TYPES.includes(String(memberType)));

    const member = await BusinessMember.create({
      userId: newUser._id,
      businessId: vendor.businessId,
      vendorId: vendor._id,
      status: BusinessMemberStatus.ACTIVE,
      memberType: (isAllowedMemberType ? memberType : "VENDOR_HELPER") as BusinessMemberType,
      vendorRole: String(vendorRole).trim(),
      invitedBy: userId,
      isDefaultBusiness: false,
      isDeleted: false,
      joinedAt: new Date(),
    });

    if (grantedRoleDoc) {
      await UserRole.updateOne(
        { userId: newUser._id, roleId: (grantedRoleDoc as any)._id },
        { $setOnInsert: { userId: newUser._id, roleId: (grantedRoleDoc as any)._id, businessId: vendor.businessId, assignedBy: userId } },
        { upsert: true }
      );
    }

    const impliedModules = MEMBER_TYPE_IMPLIED_MODULES[String(memberType)];
    if (impliedModules) {
      await grantVendorStaffAccess({
        userId: String(newUser._id),
        businessId: String(vendor.businessId),
        vendorId: String(vendor._id),
        modules: impliedModules,
        grantedBy: userId || undefined,
      });
    }

    logAction({
      action: "CREATE",
      entity: "BusinessMember",
      entityId: member._id?.toString(),
      after: { userId: newUser._id, vendorId: vendor._id, vendorRole, employeeCode, selfServiceCreated: true },
      req,
      actor: { id: userId, businessId: vendor.businessId?.toString() },
    });

    return NextResponse.json({
      success: true,
      staff: member,
      employeeCode,
      loginUsername: employeeCode.toLowerCase(),
      temporaryPassword: DEFAULT_FIRST_PASSWORD,
    });
  } catch (error: unknown) {
    // A double-submit can race two requests past each other and into a raw
    // Mongo duplicate-key error on the generated username/employeeCode --
    // give a retry-able message instead of the raw driver error text.
    if (typeof error === "object" && error !== null && "code" in error && (error as { code: number }).code === 11000) {
      return NextResponse.json(
        { success: false, error: "That employee code was just taken by another request — please try again." },
        { status: 409 }
      );
    }
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
