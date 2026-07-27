import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import EmployeeProfile from "@/models/EmployeeProfile";
import User, { AuthProvider } from "@/models/User";
import Role from "@/models/Role";
import UserRole from "@/models/UserRole";
import { generateGlobalDocumentNumber } from "@/core/numbering/numberingService";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

const SALT_ROUNDS = 12;
// Same fixed first password used for vendor self-service staff creation
// (see api/vendor/staff/create/route.ts) -- one consistent default across
// every "create a brand-new login for someone" flow in the app.
const DEFAULT_FIRST_PASSWORD = "ANgroup@123";

function permissionErrorResponse(err: any) {
  return NextResponse.json(
    { success: false, error: err.message },
    { status: err.code === "FORBIDDEN" ? 403 : 401 }
  );
}

export async function GET(request: NextRequest) {
  try {
    // Was entirely ungated -- any authenticated user of any role (including
    // CUSTOMER) could list any business's employee records, salaries
    // included, just by passing a businessId. Same requirePermission
    // pattern every other admin-data route in this codebase already uses.
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("employees", "view"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }
    const headersList = await headers();
    const userId = session.user.id;

    const { searchParams } = new URL(request.url);

    const businessId =
      headersList.get("x-active-business-id") ||
      searchParams.get("businessId");

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: "businessId is required" },
        { status: 400 }
      );
    }

    await connectDB();

    const filter: Record<string, unknown> = {
      businessId: new mongoose.Types.ObjectId(businessId),
      isDeleted: false,
    };

    const search = searchParams.get("search");
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      filter.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { department: searchRegex },
        { designation: searchRegex },
      ];
    }

    const department = searchParams.get("department");
    if (department && department.trim()) {
      filter.department = department.trim();
    }

    const status = searchParams.get("status");
    if (status && status.trim()) {
      filter.status = status.trim();
    }

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limitRaw = parseInt(searchParams.get("limit") || "50", 10);
    const limit = Math.min(100, Math.max(1, limitRaw));
    const skip = (page - 1) * limit;

    const [employees, total] = await Promise.all([
      EmployeeProfile.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EmployeeProfile.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      employees,
      total,
      page,
      totalPages,
    });
  } catch (error) {
    console.error("GET /api/employees error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // Hoisted above the try block so the catch below can still read them --
  // both are only ever assigned once the request body is parsed, so the
  // catch-all duplicate-key handler can use whatever was parsed even when
  // the failure happens later in the same request.
  let linkedUserId: string | undefined;
  let businessId: string | undefined;
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("employees", "create"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }
    const userId = session.user.id;

    const body = await request.json();

    const {
      name,
      email,
      phone,
      department,
      designation,
      employmentType,
      joiningDate,
      salary,
      businessId: parsedBusinessId,
      userId: parsedLinkedUserId,
      // createNew: this person has no platform account at all yet -- create
      // one instead of requiring the caller to pick an existing user from
      // the (platform-wide) search autocomplete first. roleCode optionally
      // assigns one of this business's own roles (Admin > Access) in the
      // same call.
      createNew,
      roleCode,
    } = body;
    businessId = parsedBusinessId;
    linkedUserId = parsedLinkedUserId;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "Employee name is required" },
        { status: 400 }
      );
    }

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: "businessId is required" },
        { status: 400 }
      );
    }

    await connectDB();

    let newlyCreatedUserId: string | undefined;
    let newlyCreatedLogin: { username: string; temporaryPassword: string } | undefined;

    if (createNew) {
      if (email) {
        const existingEmail = await User.findOne({ email: String(email).toLowerCase().trim(), isDeleted: { $ne: true } }).lean();
        if (existingEmail) {
          return NextResponse.json(
            { success: false, error: "A user with this email already exists on the platform — use the existing-user search instead if this is the same person." },
            { status: 409 }
          );
        }
      }

      // Business-scoped login code (e.g. "EMP-0001") -- generated up front
      // so it can double as both the EmployeeProfile.employeeId and the
      // new account's username, same pattern as the vendor self-service
      // staff-creation flow.
      const { value: newEmployeeId } = await generateGlobalDocumentNumber("EMPLOYEE", businessId);
      const loginUsername = newEmployeeId.toLowerCase();
      const hashedPassword = await bcrypt.hash(DEFAULT_FIRST_PASSWORD, SALT_ROUNDS);

      // Never granted the CUSTOMER floor role -- this account starts
      // scoped to only whatever role is assigned below, not double-usable
      // as a storefront login, same invariant as the vendor-created flow.
      const newUser = await User.create({
        name: name.trim(),
        email: email ? String(email).toLowerCase().trim() : `${loginUsername}@staff.local`,
        username: loginUsername,
        phone: phone?.trim() || undefined,
        password: hashedPassword,
        role: "CUSTOMER",
        isActive: true,
        isEmailVerified: false,
        authProvider: AuthProvider.CREDENTIALS,
        isDeleted: false,
        mustChangePassword: true,
      });

      newlyCreatedUserId = String(newUser._id);
      newlyCreatedLogin = { username: loginUsername, temporaryPassword: DEFAULT_FIRST_PASSWORD };

      const employee = await EmployeeProfile.create({
        userId: newUser._id,
        businessId: new mongoose.Types.ObjectId(businessId),
        employeeId: newEmployeeId,
        name: name.trim(),
        email: email?.trim() || undefined,
        phone: phone?.trim() || undefined,
        department: department?.trim() || undefined,
        designation: designation?.trim() || undefined,
        employmentType: employmentType || "FULL_TIME",
        joiningDate: joiningDate ? new Date(joiningDate) : undefined,
        salary: typeof salary === "number" ? salary : 0,
      });

      if (roleCode) {
        const roleDoc = await Role.findOne({
          code: String(roleCode).toUpperCase(),
          businessId: new mongoose.Types.ObjectId(businessId),
          vendorId: null,
        });
        if (roleDoc) {
          await UserRole.create({ userId: newUser._id, roleId: roleDoc._id, businessId, assignedBy: userId });
        }
      }

      logAction({
        action: "CREATE",
        entity: "EmployeeProfile",
        entityId: employee._id?.toString(),
        after: employee,
        req: request,
        actor: { id: userId, businessId },
      });

      return NextResponse.json(
        { success: true, employee, newUserId: newlyCreatedUserId, login: newlyCreatedLogin },
        { status: 201 }
      );
    }

    // Surface which specific thing already exists instead of a vague
    // "duplicate ID or already-linked user" -- a vendor Manager picking
    // someone from the (platform-wide, unscoped) user-search autocomplete
    // has no way to know upfront whether that person already has an
    // EmployeeProfile in this business. Deliberately looks for ANY record
    // (including soft-deleted) -- the {businessId, userId} unique index has
    // no isDeleted filter, so a previously-removed employee's row still
    // occupies that slot forever; only checking non-deleted rows here (as
    // an earlier pass of this fix did) let that case fall through to the
    // raw duplicate-key error below with the same unhelpful generic message
    // this was supposed to replace.
    let employee;
    if (linkedUserId && mongoose.Types.ObjectId.isValid(linkedUserId)) {
      const existing = await EmployeeProfile.findOne({
        businessId: new mongoose.Types.ObjectId(businessId),
        userId: new mongoose.Types.ObjectId(linkedUserId),
      });
      if (existing && !existing.isDeleted) {
        const who = existing.employeeId || existing.email || existing.name || "an existing record";
        return NextResponse.json(
          {
            success: false,
            error: `This user already has an employee record in this business (${who}) — edit their existing record instead of creating a new one.`,
            existingEmployeeId: existing.employeeId,
            existingEmployeeEmail: existing.email,
          },
          { status: 409 }
        );
      }
      if (existing && existing.isDeleted) {
        // Revive the previously-removed record instead of failing --
        // re-adding someone who was taken off the books before is a
        // legitimate action, not a genuine conflict.
        existing.set({
          isDeleted: false,
          name: name.trim(),
          email: email?.trim() || undefined,
          phone: phone?.trim() || undefined,
          department: department?.trim() || undefined,
          designation: designation?.trim() || undefined,
          employmentType: employmentType || "FULL_TIME",
          joiningDate: joiningDate ? new Date(joiningDate) : undefined,
          salary: typeof salary === "number" ? salary : 0,
          status: "ACTIVE",
        });
        employee = await existing.save();
      }
    }

    if (!employee) {
      // employeeId is unique per business (see models/EmployeeProfile.ts's
      // {businessId, employeeId} index) -- still generated through the
      // global-scope numbering variant so the underlying counter is shared
      // platform-wide (same mechanism vendor IDs use), it just can't
      // collide across businesses since the schema index is scoped.
      const { value: employeeId } = await generateGlobalDocumentNumber("EMPLOYEE", businessId);

      // Links to the actual employee's own account when the caller picked
      // one from the user-search autocomplete -- previously discarded
      // (only used to prefill name/email/phone), so an employee created
      // here could never be found by their own login. Falls back to no
      // link (a pure HR record) when nobody was picked.
      employee = await EmployeeProfile.create({
        userId: linkedUserId && mongoose.Types.ObjectId.isValid(linkedUserId)
          ? new mongoose.Types.ObjectId(linkedUserId)
          : undefined,
        businessId: new mongoose.Types.ObjectId(businessId),
        employeeId,
        name: name.trim(),
        email: email?.trim() || undefined,
        phone: phone?.trim() || undefined,
        department: department?.trim() || undefined,
        designation: designation?.trim() || undefined,
        employmentType: employmentType || "FULL_TIME",
        joiningDate: joiningDate ? new Date(joiningDate) : undefined,
        salary: typeof salary === "number" ? salary : 0,
      });
    }

    logAction({
      action: "CREATE",
      entity: "EmployeeProfile",
      entityId: employee._id?.toString(),
      after: employee,
      req: request,
      actor: { id: userId, businessId },
    });

    return NextResponse.json(
      { success: true, employee },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/employees error:", error);

    if (error instanceof mongoose.Error.ValidationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    // Duplicate employeeId (extremely rare counter race) or duplicate
    // {businessId,userId} (that user already has an employee record in
    // this business, e.g. a double-submit racing past the pre-check
    // above, OR this request reached here via the "no linkedUserId"
    // branch further up, which never ran that pre-check at all).
    // keyPattern tells us which one actually collided.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: number }).code === 11000
    ) {
      const keyPattern = (error as { keyPattern?: Record<string, number> }).keyPattern || {};
      if ("userId" in keyPattern) {
        // Same identifier lookup as the pre-check above -- this path is
        // reached without ever running that check (e.g. linkedUserId
        // failed Types.ObjectId.isValid, or a genuine double-submit race),
        // so the message was previously generic with no way to tell WHICH
        // record actually collided. Reuses linkedUserId/businessId already
        // parsed from the request body earlier in this same function --
        // the request stream itself was already consumed by that first
        // request.json() call, so it can't be re-read here.
        let who = "an existing record";
        if (linkedUserId && mongoose.Types.ObjectId.isValid(linkedUserId) && businessId) {
          const conflicting = await EmployeeProfile.findOne({
            businessId: new mongoose.Types.ObjectId(businessId),
            userId: new mongoose.Types.ObjectId(linkedUserId),
          }).select("employeeId email name").lean();
          if (conflicting) {
            who = (conflicting as any).employeeId || (conflicting as any).email || (conflicting as any).name || who;
          }
        }
        return NextResponse.json(
          { success: false, error: `This user already has an employee record in this business (${who}) — edit their existing record instead of creating a new one.` },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { success: false, error: "That employee ID was just taken by another request — please try again." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
