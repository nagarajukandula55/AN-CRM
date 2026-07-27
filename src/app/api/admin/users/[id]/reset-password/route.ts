/**
 * POST /api/admin/users/[id]/reset-password — super-admin-only password
 * control. Never reads or returns the user's actual password (it's a
 * one-way bcrypt hash, unrecoverable by design) — this only sets a NEW
 * one, either supplied directly or randomly generated, and always forces
 * the user to change it on next login.
 *
 * Body: { mode: "set", newPassword: string } | { mode: "generate" }
 * "generate" returns the plaintext temp password in this one response
 * only — it is never stored or logged in plaintext anywhere.
 */

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { notifyUser } from "@/services/notification.service";

const SALT_ROUNDS = 12;
const MIN_LENGTH = 6;

function generateTempPassword(): string {
  // Readable-ish random password: 10 chars, avoids ambiguous glyphs.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(crypto.randomFillSync(new Uint8Array(10)))
    .map((b) => alphabet[b % alphabet.length])
    .join("");
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    if (!session.isSuperAdmin) {
      return NextResponse.json(
        { success: false, message: "Only super admin can reset a user's password" },
        { status: 403 }
      );
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid user id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const { mode, newPassword } = body;

    let plaintext: string;
    if (mode === "generate") {
      plaintext = generateTempPassword();
    } else if (mode === "set") {
      if (!newPassword || newPassword.length < MIN_LENGTH) {
        return NextResponse.json(
          { success: false, message: `newPassword must be at least ${MIN_LENGTH} characters` },
          { status: 400 }
        );
      }
      plaintext = newPassword;
    } else {
      return NextResponse.json({ success: false, message: 'mode must be "set" or "generate"' }, { status: 400 });
    }

    await connectDB();

    const user = await User.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    user.password = await bcrypt.hash(plaintext, SALT_ROUNDS);
    user.passwordChangedAt = new Date();
    user.mustChangePassword = true;
    await user.save();

    logAction({
      action: "RESET_PASSWORD",
      entity: "User",
      entityId: id,
      after: { mode },
      req,
      actor: { id: session.user.id },
    });

    notifyUser({
      userId: id,
      title: "Password changed",
      message: "Your password was changed by an administrator. You'll be asked to set a new one on your next login.",
      type: "warning",
    });

    return NextResponse.json({
      success: true,
      message: "Password reset. User must change it on next login.",
      // Only ever returned here, once, to the admin who just performed the
      // reset -- never stored in plaintext, never returned by any GET.
      temporaryPassword: mode === "generate" ? plaintext : undefined,
    });
  } catch (err: any) {
    console.error("Admin reset-password error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
