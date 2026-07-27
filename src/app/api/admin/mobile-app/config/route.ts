/**
 * PATCH /api/admin/mobile-app/config — super-admin-only edit for the
 * mobile app's config (see GET /api/mobile-app/config, the public read
 * side the app itself calls). Controls what every install of the app
 * does platform-wide, so this is not something a business-scoped edit
 * permission should grant.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import MobileAppConfig from "@/models/MobileAppConfig";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { logAction } from "@/lib/audit/logAction";

const APP_KEY = "native";

export async function PATCH(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    if (!session.isSuperAdmin) {
      return NextResponse.json(
        { success: false, message: "Only Super Admins can change mobile app settings" },
        { status: 403 }
      );
    }

    await connectDB();
    const body = await req.json();
    const { businessId, ios, android, maintenanceMode, maintenanceMessage, pushNotificationsEnabled } = body;

    const updates: Record<string, unknown> = {};
    if (businessId !== undefined) updates.businessId = businessId || null;
    if (ios !== undefined) updates.ios = ios;
    if (android !== undefined) updates.android = android;
    if (maintenanceMode !== undefined) updates.maintenanceMode = maintenanceMode;
    if (maintenanceMessage !== undefined) updates.maintenanceMessage = maintenanceMessage;
    if (pushNotificationsEnabled !== undefined) updates.pushNotificationsEnabled = pushNotificationsEnabled;

    const config = await MobileAppConfig.findOneAndUpdate(
      { appKey: APP_KEY },
      { $set: updates, $setOnInsert: { appKey: APP_KEY } },
      { new: true, upsert: true }
    ).lean();

    logAction({
      action: "UPDATE",
      entity: "MobileAppConfig",
      entityId: APP_KEY,
      after: updates,
      req,
      actor: { id: session.user.id },
    });

    return NextResponse.json({ success: true, config });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to update mobile app config" },
      { status: 500 }
    );
  }
}
