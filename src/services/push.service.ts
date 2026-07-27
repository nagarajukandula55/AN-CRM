import DeviceToken from "@/models/DeviceToken";

/**
 * Expo push — no API key needed, just POST to Expo's relay with the
 * device's Expo push token (see https://docs.expo.dev/push-notifications/
 * sending-notifications/). Deliberately thin and best-effort: called from
 * notification.service.ts's notifyUser/notifySuperAdmins and from chat
 * message creation, and must never throw into (or block) the caller —
 * same convention those already follow for the in-app Notification write.
 */
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

async function sendExpoPush(tokens: string[], payload: PushPayload): Promise<void> {
  if (tokens.length === 0) return;
  try {
    await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(
        tokens.map((to) => ({
          to,
          title: payload.title,
          body: payload.body,
          data: payload.data,
          sound: "default",
        }))
      ),
    });
  } catch (err) {
    console.error("[push] Expo push send failed:", err);
  }
}

export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<void> {
  try {
    const devices = await DeviceToken.find({ userId }).select("token").lean();
    await sendExpoPush(devices.map((d) => d.token), payload);
  } catch (err) {
    console.error("[push] sendPushToUser failed:", err);
  }
}

export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<void> {
  try {
    const devices = await DeviceToken.find({ userId: { $in: userIds } }).select("token").lean();
    await sendExpoPush(devices.map((d) => d.token), payload);
  } catch (err) {
    console.error("[push] sendPushToUsers failed:", err);
  }
}
