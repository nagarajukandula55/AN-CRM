import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SsoSourceMapping from "@/models/SsoSourceMapping";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { logAction } from "@/lib/audit/logAction";

/**
 * GET/POST /api/admin/sso-sources — Super-Admin-only management of the
 * registration-source -> default-Role mapping used by /api/auth/register
 * (see that route's resolveRegistrationSource). Platform-wide config, not
 * scoped to any business.
 */

function requireSuperAdmin(session: any) {
  if (!session?.isSuperAdmin) {
    throw Object.assign(new Error("Super Admin only"), { code: "FORBIDDEN" });
  }
}

export async function GET() {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requireSuperAdmin(session);
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message }, { status: 403 });
    }

    await connectDB();
    const mappings = await SsoSourceMapping.find({}).sort({ urlPattern: 1 }).lean();
    return NextResponse.json({ success: true, mappings });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requireSuperAdmin(session);
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message }, { status: 403 });
    }

    const body = await req.json();
    const { urlPattern, sourceLabel, defaultRoleCode, isActive } = body;

    if (!urlPattern?.trim() || !sourceLabel?.trim() || !defaultRoleCode?.trim()) {
      return NextResponse.json(
        { success: false, error: "urlPattern, sourceLabel and defaultRoleCode are required" },
        { status: 400 }
      );
    }

    await connectDB();
    const mapping = await SsoSourceMapping.create({
      urlPattern: urlPattern.trim(),
      sourceLabel: sourceLabel.trim(),
      defaultRoleCode: defaultRoleCode.trim(),
      isActive: isActive !== undefined ? isActive : true,
    });

    logAction({
      action: "CREATE",
      entity: "SsoSourceMapping",
      entityId: mapping?._id?.toString(),
      after: body,
      req,
      actor: { id: session.user.id },
    });

    return NextResponse.json({ success: true, mapping }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("duplicate key") || message.includes("E11000")) {
      return NextResponse.json(
        { success: false, error: "A mapping for this URL pattern already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
