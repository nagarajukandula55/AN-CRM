/**
 * GET /api/mobile-app/config — PUBLIC. What the React Native app (/mobile)
 * calls on launch, before the user is signed in, to pick up its
 * businessId, min-version gate, maintenance mode, etc. without a rebuild.
 * Editing this config is a separate, super-admin-only route --
 * PATCH /api/admin/mobile-app/config -- deliberately NOT the same path,
 * since marking this path public in middleware.ts means requests here
 * never get the x-user-id/x-is-super-admin headers an edit endpoint would
 * need to check (see middleware.ts's isPublic() short-circuit).
 */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import MobileAppConfig from "@/models/MobileAppConfig";

const APP_KEY = "native";

export async function GET() {
  try {
    await connectDB();
    const config = await MobileAppConfig.findOne({ appKey: APP_KEY }).lean();
    return NextResponse.json({
      success: true,
      config: config || {
        appKey: APP_KEY,
        businessId: null,
        ios: { forceUpdate: false },
        android: { forceUpdate: false },
        maintenanceMode: false,
        pushNotificationsEnabled: false,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to load mobile app config" },
      { status: 500 }
    );
  }
}
