import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Role from "@/models/Role";
import UserRole from "@/models/UserRole";
import { getOrCreateANGroupBusinessId } from "@/core/access/anGroupBusiness.service";
import { stripFloorRoles } from "@/core/access/floorRoles.service";
import { logAction } from "@/lib/audit/logAction";

/**
 * AN Group platform-staff management — Super Admin only.
 *
 * REBUILT: this used to seed and offer a fixed menu of 6 department roles
 * (Business Admin, Product Admin, ...). Per explicit direction ("don't
 * keep any default roles, i'll add everything by myself"), NOTHING is
 * seeded here anymore. The role list offered is exactly the platform-
 * scoped roles that actually exist: AN_STAFF (structural — sees all data
 * across every business) plus every custom role the Super Admin created
 * under AN Group from Admin > Access. Floor/customer codes and vendor-
 * scoped roles never appear.
 *
 * GET  — lists those roles and every user currently holding each.
 * POST — creates a brand-new login for one of those roles, or attaches
 *        the role to an existing user (by username), per `mode`.
 */

const HIDDEN_CODES = ["SUPER_ADMIN", "CUSTOMER", "CUSTOMER_ANGROUP", "CUSTOMER_SHOPNATIVE"];

async function requireSuperAdmin() {
  const h = await headers();
  const userId = h.get("x-user-id");
  const isSuperAdmin = h.get("x-is-super-admin") === "true";
  return { userId, ok: !!userId && isSuperAdmin };
}

async function listPlatformRoles() {
  const anGroupId = await getOrCreateANGroupBusinessId();
  return Role.find({
    vendorId: null,
    $or: [{ businessId: null }, { businessId: anGroupId }],
    code: { $nin: HIDDEN_CODES },
    isDeleted: { $ne: true },
  })
    .select("code name description permissions")
    .sort({ name: 1 })
    .lean();
}

export async function GET() {
  try {
    await connectDB();
    const { ok } = await requireSuperAdmin();
    if (!ok) return NextResponse.json({ success: false, error: "Super Admin access required" }, { status: 403 });

    const roles = (await listPlatformRoles()) as any[];

    const grants = await UserRole.find({ roleId: { $in: roles.map((r) => r._id) } })
      .populate("userId", "name email username")
      .lean();

    const holders = roles.map((r) => ({
      code: r.code,
      name: r.name,
      description: r.description,
      roleId: String(r._id),
      users: (grants as any[])
        .filter((g) => String(g.roleId) === String(r._id))
        .map((g) => g.userId)
        .filter(Boolean),
    }));

    return NextResponse.json({ success: true, roles: holders });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { userId: callerId, ok } = await requireSuperAdmin();
    if (!ok) return NextResponse.json({ success: false, error: "Super Admin access required" }, { status: 403 });

    const body = await req.json();
    const { mode, roleCode } = body;

    const platformRoles = (await listPlatformRoles()) as any[];
    const roleDoc = platformRoles.find((r) => r.code === String(roleCode || "").toUpperCase());
    if (!roleDoc) {
      return NextResponse.json(
        { success: false, error: "Unknown platform role — create it first from Admin > Access under AN Group" },
        { status: 400 }
      );
    }

    if (mode === "assign") {
      const { username } = body;
      if (!username) {
        return NextResponse.json({ success: false, error: "username is required" }, { status: 400 });
      }
      const targetUser = await User.findOne({
        username: String(username).toLowerCase().trim(),
        isDeleted: { $ne: true },
      });
      if (!targetUser) {
        return NextResponse.json({ success: false, error: "No user found with that ID" }, { status: 404 });
      }
      await UserRole.findOneAndUpdate(
        { userId: targetUser._id, roleId: roleDoc._id },
        { $setOnInsert: { userId: targetUser._id, roleId: roleDoc._id, assignedBy: callerId } },
        { upsert: true }
      );
      // Real access granted -> registration floor removed.
      await stripFloorRoles(String(targetUser._id));
      logAction({ action: "UPDATE", entity: "UserRole", entityId: String(targetUser._id), after: { roleCode }, req });
      return NextResponse.json({ success: true, user: { _id: targetUser._id, name: targetUser.name, username: targetUser.username } });
    }

    if (mode === "create") {
      const { name, username, password } = body;
      if (!name || !username) {
        return NextResponse.json({ success: false, error: "name and username are required" }, { status: 400 });
      }
      const uname = String(username).toLowerCase().trim();
      const existing = await User.findOne({ username: uname, isDeleted: { $ne: true } });
      if (existing) {
        return NextResponse.json({ success: false, error: "This user ID is already taken" }, { status: 409 });
      }
      // "id and password as same" per the request -- still forced through
      // mustChangePassword below so it's a one-time bootstrap credential,
      // not a standing weak password.
      const rawPassword = password || uname;
      const hashedPassword = await bcrypt.hash(rawPassword, 12);
      const user = await User.create({
        name,
        email: `${uname}@angroup.staff`,
        username: uname,
        password: hashedPassword,
        role: "ADMIN",
        isActive: true,
        isEmailVerified: false,
        authProvider: "credentials",
        isDeleted: false,
        mustChangePassword: true,
      });
      await UserRole.create({ userId: user._id, roleId: roleDoc._id, assignedBy: callerId });
      logAction({ action: "CREATE", entity: "User", entityId: String(user._id), after: { roleCode }, req });
      return NextResponse.json({
        success: true,
        user: { _id: user._id, name: user.name, username: user.username },
        credentials: { username: uname, password: rawPassword },
      });
    }

    return NextResponse.json({ success: false, error: "mode must be 'create' or 'assign'" }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
