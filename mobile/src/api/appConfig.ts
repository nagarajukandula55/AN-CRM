import { anGet } from "./client";

export interface RemoteAppConfig {
  businessId?: string | null;
  ios: { minVersion?: string; forceUpdate: boolean; storeUrl?: string };
  android: { minVersion?: string; forceUpdate: boolean; storeUrl?: string };
  maintenanceMode: boolean;
  maintenanceMessage?: string;
  pushNotificationsEnabled: boolean;
}

// GET /api/mobile-app/config -- public, no auth needed. Set once via
// admin/native/mobile-settings in ANgroup (super admin only). Called on
// app launch so maintenance mode / force-update / businessId can change
// without shipping a new build.
export async function getAppConfig(): Promise<RemoteAppConfig | null> {
  try {
    const data = await anGet("/api/mobile-app/config");
    return data?.config || null;
  } catch {
    return null;
  }
}
