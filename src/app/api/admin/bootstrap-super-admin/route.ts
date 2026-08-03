import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Role from "@/models/Role";
import UserRole from "@/models/UserRole";
import bcrypt from "bcryptjs";

/**
 * POST /api/admin/bootstrap-super-admin
 *
 * ONE-TIME emergency bootstrap, same insert-only logic as
 * scripts/createSuperAdmin.ts -- for when there's no working admin
 * session AND no way to run a local script against production (no
 * Node.js/git on the operator's machine). Gated by a shared secret
 * (SUPER_ADMIN_BOOTSTRAP_SECRET env var) instead of an admin session,
 * since the whole point is there IS no working admin session yet.
 *
 * INSERT-ONLY, IDEMPOTENT: refuses to touch an existing user with that
 * email -- never overwrites a password, never changes an existing
 * account's role. Delete this route (or unset the env var) once no
 * longer needed; leaving it live is a standing risk if the secret leaks.
 */
export async function POST(req: NextRequest) {
  try {
    const secret = process.env.SUPER_ADMIN_BOOTSTRAP_SECRET;
    if (!secret) {
      return NextResponse.json(
        { success: false, message: "Bootstrap is not enabled (SUPER_ADMIN_BOOTSTRAP_SECRET not set)." },
        { status: 503 }
      );
    }

    const body = await req.json();
    const { token, email, name, password } = body ?? {};
    if (String(token || "").trim() !== String(secret || "").trim()) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    if (!email || !password || password.length < 8) {
      return NextResponse.json(
        { success: false, message: "email and password (min 8 chars) are required" },
        { status: 400 }
      );
    }

    await connectDB();

    const existing = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (existing) {
      return NextResponse.json({
        success: false,
        message: `A user with email ${email} already exists (role: ${existing.role}). Not touching it — use the normal password-reset flow instead.`,
      }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({
      name: name || "Super Admin",
      email: String(email).toLowerCase().trim(),
      password: hashedPassword,
      role: "SUPER_ADMIN",
      isActive: true,
      isEmailVerified: true,
      authProvider: "credentials",
    } as any);

    let roleDoc = await Role.findOne({ code: "SUPER_ADMIN" });
    if (!roleDoc) {
      roleDoc = await Role.create({
        name: "Super Admin",
        code: "SUPER_ADMIN",
        description: "Super Admin",
        isSystem: true,
      });
    }
    await UserRole.create({ userId: user._id, roleId: roleDoc._id });

    return NextResponse.json({
      success: true,
      message: `Super admin created: ${user.email}. You can now log in at /login with this email and the password you set. Consider removing SUPER_ADMIN_BOOTSTRAP_SECRET from your environment now that this is done.`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
