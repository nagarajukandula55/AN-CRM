import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";

/**
 * GET /api/users/lookup?username= — PUBLIC, minimal-exposure lookup used by
 * the vendor application form (/vendor-apply) to validate that a User ID
 * the applicant typed in actually belongs to an already-registered account
 * (see /register) before letting them submit. Deliberately returns only
 * {exists, name} -- never email/phone/role/id -- so this can't be used to
 * enumerate account details, only confirm "yes, that user ID is real."
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = (searchParams.get("username") || "").toLowerCase().trim();
    if (!username) {
      return NextResponse.json({ success: false, message: "username is required" }, { status: 400 });
    }

    await connectDB();

    const user = await User.findOne({ username, isDeleted: { $ne: true } })
      .select("name")
      .lean();

    return NextResponse.json({
      success: true,
      exists: !!user,
      name: user ? (user as any).name : undefined,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Lookup failed" },
      { status: 500 }
    );
  }
}
