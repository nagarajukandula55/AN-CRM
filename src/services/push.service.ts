import webpush from "web-push";
import DeviceToken from "@/models/DeviceToken";
import PushSubscription from "@/models/PushSubscription";

/**
 * Expo push — no API key needed, just POST to Expo's relay with the
 * device's Expo push token (see https://docs.expo.dev/push-notifications/
 * sending-notifications/). Deliberately thin and best-effort: called from
 * notification.service.ts's notifyUser/notifySuperAdmins and from chat
 * message creation, and must never throw into (or block) the caller —
 * same convention those already follow for the in-app Notification write.
 *
 * Browser Web Push (below) is the actual "pop a notification on the
 * website" channel — Expo only reaches the mobile app, and the in-app
 * bell list only shows up while someone is already looking at the console.
 * Both are best-effort and fire in parallel from the same call.
 */
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:support@angroup.in",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
}

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

async function sendBrowserPush(userIds: string[], payload: PushPayload): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || userIds.length === 0) return;
  try {
    const subs = await PushSubscription.find({ userId: { $in: userIds } }).lean();
    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      link: (payload.data?.link as string) || "/",
    });
    await Promise.allSettled(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: s.keys as { p256dh: string; auth: string } },
            body
          );
        } catch (err: any) {
          // 404/410 = the browser unsubscribed or cleared storage --
          // stop trying to reach a dead endpoint instead of erroring on
          // every future notification for this user.
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await PushSubscription.deleteOne({ _id: s._id }).catch(() => {});
          } else {
            console.error("[push] browser push send failed:", err?.message || err);
          }
        }
      })
    );
  } catch (err) {
    console.error("[push] sendBrowserPush failed:", err);
  }
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
    await Promise.allSettled([sendExpoPush(devices.map((d) => d.token), payload), sendBrowserPush([userId], payload)]);
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
    await Promise.allSettled([sendExpoPush(devices.map((d) => d.token), payload), sendBrowserPush(userIds, payload)]);
  } catch (err) {
    console.error("[push] sendPushToUsers failed:", err);
  }
}
